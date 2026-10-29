import { DEFAULT_ROOM_SETTINGS, GAME_RULES, NO_AI_VOTE, RoomSettings } from '@quem/shared';
import { GameError } from '../../../shared/game-error';
import { seededRandom } from '../../../shared/random';
import { DEFAULT_PERSONA } from './content';
import { GameMatch } from './game-match';

const T0 = new Date('2026-01-01T12:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const PLAYERS = ['ana', 'beto', 'caio', 'duda'];

function startMatch(settings: Partial<RoomSettings> = {}, players = PLAYERS, seed = 7) {
  return GameMatch.start({
    roomId: 'room-1',
    number: 1,
    playerIds: players,
    settings: { ...DEFAULT_ROOM_SETTINGS, ...settings },
    now: T0,
    random: seededRandom(seed),
  });
}

describe('chat names', () => {
  it('uses the chosen name and draws the rest without repeating it', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const match = GameMatch.start({
        roomId: 'room-1',
        number: 1,
        playerIds: PLAYERS,
        chatNames: new Map([['ana', 'Aninha']]),
        settings: DEFAULT_ROOM_SETTINGS,
        now: T0,
        random: seededRandom(seed),
      });
      const seats = new Map(match.seats.map((s) => [s.playerId, s.pseudonym]));
      expect(seats.get('ana')).toBe('Aninha');
      expect(new Set(seats.values()).size).toBe(PLAYERS.length);
    }
  });
});

function masterOf(match: GameMatch) {
  return match.masterSeats()[0];
}

function humans(match: GameMatch) {
  return match.playerSeats();
}

/** Leva a partida até a conversa, com o Mestre já tendo escrito a persona. */
function inConversation(settings: Partial<RoomSettings> = {}) {
  const match = startMatch(settings);
  match.submitCreation(masterOf(match).playerId, {
    persona: 'fala como pirata, adora batata',
    usingOwnKey: false,
  });
  match.advance(at(10), seededRandom(1));
  return match;
}

describe('GameMatch.start', () => {
  it('starts in the creation phase with a deadline', () => {
    const match = startMatch();
    expect(match.phase).toBe('creation');
    expect(match.phaseEndsAt).toEqual(at(DEFAULT_ROOM_SETTINGS.creationSeconds));
  });

  it('needs at least three players', () => {
    expect(() => startMatch({}, ['ana', 'beto'])).toThrow(GameError);
  });

  it('draws exactly one master when the secret AI count is off', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(startMatch({}, PLAYERS, seed).masterSeats()).toHaveLength(1);
    }
  });

  it('can draw 0, 1 or 2 masters when the secret AI count is on', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      counts.add(startMatch({ secretAiCount: true }, PLAYERS, seed).aiCount);
    }
    expect([...counts].sort()).toEqual([0, 1, 2]);
  });

  it('always leaves at least two humans', () => {
    for (let seed = 0; seed < 100; seed++) {
      const match = startMatch({ secretAiCount: true }, ['a', 'b', 'c'], seed);
      expect(match.playerSeats().length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every seat a different pseudonym', () => {
    const match = startMatch();
    const names = new Set(match.seats.map((s) => s.pseudonym));
    expect(names.size).toBe(PLAYERS.length);
  });

  it('hides the creation deadline from non-masters when the AI count is secret', () => {
    const secret = startMatch({ secretAiCount: true }, PLAYERS, 3);
    for (const seat of secret.seats) {
      expect(secret.deadlineVisibleTo(seat.playerId)).toBe(seat.role === 'master');
    }
    const open = startMatch({ secretAiCount: false });
    expect(open.seats.every((s) => open.deadlineVisibleTo(s.playerId))).toBe(true);
    open.advance(at(120), seededRandom(1));
    secret.advance(at(120), seededRandom(1));
    expect(secret.seats.every((s) => secret.deadlineVisibleTo(s.playerId))).toBe(true);
  });

  it('ends the creation early at a random time when there is no AI', () => {
    let match = startMatch({ secretAiCount: true }, PLAYERS, 0);
    for (let seed = 1; match.aiCount !== 0; seed++) {
      match = startMatch({ secretAiCount: true }, PLAYERS, seed);
    }
    const full = DEFAULT_ROOM_SETTINGS.creationSeconds * 1000;
    const planned = match.phaseEndsAt!.getTime() - T0.getTime();
    expect(planned).toBeGreaterThanOrEqual(full * 0.4);
    expect(planned).toBeLessThanOrEqual(full);
  });
});

describe('creation phase', () => {
  it('accepts the persona only from the master', () => {
    const match = startMatch();
    const human = humans(match)[0];
    expect(() =>
      match.submitCreation(human.playerId, { persona: 'qualquer coisa aqui', usingOwnKey: false }),
    ).toThrow('Só o Mestre');
  });

  it('marks the master as ready', () => {
    const match = startMatch();
    expect(match.allMastersReady()).toBe(false);
    match.submitCreation(masterOf(match).playerId, {
      persona: 'fala como pirata',
      usingOwnKey: false,
    });
    expect(match.allMastersReady()).toBe(true);
  });

  it('rejects offensive personas', () => {
    const match = startMatch();
    expect(() =>
      match.submitCreation(masterOf(match).playerId, {
        persona: 'chama todo mundo de retardado',
        usingOwnKey: false,
      }),
    ).toThrow(GameError);
  });

  it('keeps mirror samples only when mirror mode is on', () => {
    const off = startMatch({ mirrorMode: false });
    off.submitCreation(masterOf(off).playerId, {
      persona: 'fala como pirata',
      mirrorSamples: ['eae mano'],
      usingOwnKey: false,
    });
    expect(masterOf(off).mirrorSamples).toEqual([]);

    const on = startMatch({ mirrorMode: true });
    on.submitCreation(masterOf(on).playerId, {
      persona: 'fala como pirata',
      mirrorSamples: ['eae mano', '  ', 'kkkk'],
      usingOwnKey: false,
    });
    expect(masterOf(on).mirrorSamples).toEqual(['eae mano', 'kkkk']);
  });

  it('uses a default persona if the master did not write one in time', () => {
    const match = startMatch();
    match.advance(at(120), seededRandom(1));
    expect(match.phase).toBe('conversation');
    expect(masterOf(match).persona).toBe(DEFAULT_PERSONA);
  });
});

describe('conversation phase', () => {
  it('starts with a theme when topics are on', () => {
    expect(inConversation({ topicAndFlash: true }).theme).toEqual(expect.any(String));
    expect(inConversation({ topicAndFlash: false }).theme).toBeNull();
  });

  it('lets humans talk and blocks the master', () => {
    const match = inConversation();
    const { text } = match.registerHumanMessage(humans(match)[0].playerId, '  oi   gente ', at(11));
    expect(text).toBe('oi gente');
    expect(() => match.registerHumanMessage(masterOf(match).playerId, 'oi', at(11))).toThrow(
      'O Mestre não digita',
    );
  });

  it('enforces length and interval limits when they are on', () => {
    const match = inConversation({ messageLimits: true });
    const player = humans(match)[0].playerId;
    const long = 'a'.repeat(GAME_RULES.maxMessageChars + 1);
    expect(() => match.registerHumanMessage(player, long, at(11))).toThrow(GameError);

    match.registerHumanMessage(player, 'primeira', at(12));
    expect(() => match.registerHumanMessage(player, 'segunda', at(13))).toThrow('Calma');
    expect(() => match.registerHumanMessage(player, 'segunda', at(15))).not.toThrow();
  });

  it('skips the interval limit when limits are off', () => {
    const match = inConversation({ messageLimits: false });
    const player = humans(match)[0].playerId;
    match.registerHumanMessage(player, 'primeira', at(12));
    expect(() => match.registerHumanMessage(player, 'segunda', at(12))).not.toThrow();
  });

  it('records AI replies and the broken-character flag', () => {
    const match = inConversation();
    const seat = masterOf(match);
    match.registerAiMessage(seat.id, at(20), false);
    match.registerAiMessage(seat.id, at(30), true);
    match.registerAiMessage(seat.id, at(40), false);
    expect(seat.aiReplies).toBe(3);
    expect(seat.brokeCharacter).toBe(true);
  });

  it('limits master interventions', () => {
    const match = inConversation({ masterInterventions: true });
    const master = masterOf(match).playerId;
    for (let i = 0; i < GAME_RULES.masterInterventions; i++) match.useIntervention(master);
    expect(() => match.useIntervention(master)).toThrow('todas as intervenções');
  });

  it('refuses interventions when the mechanic is off', () => {
    const match = inConversation({ masterInterventions: false });
    expect(() => match.useIntervention(masterOf(match).playerId)).toThrow('desligadas');
  });

  it('opens a flash question with a 30 second window', () => {
    const match = inConversation();
    match.startFlash('Café ou chá?', at(60));
    expect(match.flash).toEqual({ question: 'Café ou chá?', endsAt: at(90).toISOString() });
  });
});

describe('voting', () => {
  it('only allows votes in the voting phase when vote lock is off', () => {
    const match = inConversation({ voteLock: false });
    const [voter, other] = humans(match);
    expect(() => match.castVote(voter.playerId, other.id, at(20))).toThrow('não pode votar');
    match.advance(at(300), seededRandom(1));
    match.castVote(voter.playerId, other.id, at(301));
    expect(voter.vote?.target).toBe(other.id);
  });

  it('allows voting and locking during the conversation when vote lock is on', () => {
    const match = inConversation({ voteLock: true });
    const voter = humans(match)[0];
    match.castVote(voter.playerId, masterOf(match).id, at(20));
    match.lockVote(voter.playerId, at(21));
    expect(() => match.castVote(voter.playerId, humans(match)[1].id, at(22))).toThrow('travado');
  });

  it('does not let masters vote or players vote for themselves', () => {
    const match = inConversation();
    match.advance(at(300), seededRandom(1));
    const voter = humans(match)[0];
    expect(() => match.castVote(masterOf(match).playerId, voter.id, at(301))).toThrow();
    expect(() => match.castVote(voter.playerId, voter.id, at(301))).toThrow('si mesmo');
  });

  it('accepts "no AI" only when the AI count is secret', () => {
    const fixed = inConversation({ secretAiCount: false });
    fixed.advance(at(300), seededRandom(1));
    expect(() => fixed.castVote(humans(fixed)[0].playerId, NO_AI_VOTE, at(301))).toThrow();
  });

  it('knows when everybody voted', () => {
    const match = inConversation();
    match.advance(at(300), seededRandom(1));
    const target = masterOf(match).id;
    for (const seat of humans(match)) {
      expect(match.allVotesIn()).toBe(false);
      match.castVote(seat.playerId, target, at(301));
    }
    expect(match.allVotesIn()).toBe(true);
  });
});

describe('full match', () => {
  it('goes from creation to reveal and scores everybody', () => {
    const match = inConversation();
    expect(match.isDue(at(309))).toBe(false);
    expect(match.isDue(at(310))).toBe(true);
    match.advance(at(310), seededRandom(1));
    expect(match.phase).toBe('voting');

    const [first, second, third] = humans(match);
    match.castVote(first.playerId, masterOf(match).id, at(311));
    match.castVote(second.playerId, masterOf(match).id, at(311));
    match.castVote(third.playerId, first.id, at(311));
    match.advance(at(320), seededRandom(1));

    expect(match.phase).toBe('reveal');
    expect(match.isFinished()).toBe(true);
    expect(match.finishedAt).toEqual(at(320));
    expect(match.scores).toHaveLength(PLAYERS.length);
    expect(() => match.advance(at(321), seededRandom(1))).toThrow('já terminou');
  });

  it('hands out the ranking points only once', () => {
    const match = inConversation();
    expect(match.takeRankingDeltas()).toEqual([]);
    match.advance(at(310), seededRandom(1));
    match.advance(at(320), seededRandom(1));
    expect(match.takeRankingDeltas()).toHaveLength(PLAYERS.length);
    expect(match.takeRankingDeltas()).toEqual([]);
  });

  it('ends the AI when the budget breaker trips', () => {
    const match = inConversation();
    match.pauseAi();
    expect(match.aiResting).toBe(true);
  });
});
