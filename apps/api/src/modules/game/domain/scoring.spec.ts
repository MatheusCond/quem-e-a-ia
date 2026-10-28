import { DEFAULT_ROOM_SETTINGS, NO_AI_VOTE, RoomSettings } from '@quem/shared';
import { computeScores, SCORE } from './scoring';
import { Seat, SeatVote } from './seat';

const START = new Date('2026-01-01T12:00:00Z');

function seat(id: string, role: Seat['role'], vote: Partial<SeatVote> | null = null): Seat {
  return {
    id,
    playerId: `p-${id}`,
    pseudonym: id,
    avatar: { emoji: '🦊', color: '#000' },
    role,
    lastMessageAt: null,
    vote: vote
      ? { target: '', locked: false, castAt: START.toISOString(), lockedAt: null, ...vote }
      : null,
    persona: null,
    mirrorSamples: [],
    submitted: true,
    usingOwnKey: false,
    interventionsLeft: 0,
    reviewNext: false,
    aiReplies: 0,
    brokeCharacter: false,
  };
}

function score(seats: Seat[], settings: Partial<RoomSettings> = {}) {
  return computeScores({
    seats,
    settings: { ...DEFAULT_ROOM_SETTINGS, ...settings },
    conversationStartedAt: START,
  });
}

const deltaOf = (result: ReturnType<typeof score>, id: string) =>
  result.lines.find((l) => l.playerId === `p-${id}`)!.delta;

describe('computeScores', () => {
  it('rewards finding the AI and punishes accusing a human', () => {
    const result = score([
      seat('ai', 'master'),
      seat('ana', 'player', { target: 'ai' }),
      seat('beto', 'player', { target: 'ana' }),
      seat('caio', 'player'),
    ]);
    expect(deltaOf(result, 'ana')).toBe(SCORE.correctVote);
    expect(deltaOf(result, 'beto')).toBe(SCORE.wrongAccusation);
    expect(deltaOf(result, 'caio')).toBe(0);
    expect(result.correctVoters).toBe(1);
    expect(result.totalVoters).toBe(2);
  });

  it('pays the master for each voter that was fooled', () => {
    const result = score([
      seat('ai', 'master'),
      seat('ana', 'player', { target: 'ai' }),
      seat('beto', 'player', { target: 'ana' }),
      seat('caio', 'player', { target: 'beto' }),
      seat('duda', 'player'),
    ]);
    // beto e caio foram enganados; duda não votou e não conta.
    expect(deltaOf(result, 'ai')).toBe(2 * SCORE.perDeceivedPlayer);
    expect(result.deceivedByMaster['p-ai']).toBe(2);
  });

  it('takes points from the master when the AI broke character', () => {
    const broken = { ...seat('ai', 'master'), brokeCharacter: true };
    const seats = [broken, seat('ana', 'player', { target: 'ai' })];
    expect(deltaOf(score(seats, { injectionPenalty: true }), 'ai')).toBe(SCORE.brokeCharacter);
    expect(deltaOf(score(seats, { injectionPenalty: false }), 'ai')).toBe(0);
  });

  it('gives a bigger bonus the earlier the vote was locked', () => {
    const lockedAt = (seconds: number) => new Date(START.getTime() + seconds * 1000).toISOString();
    const seats = [
      seat('ai', 'master'),
      seat('early', 'player', { target: 'ai', locked: true, lockedAt: lockedAt(0) }),
      seat('half', 'player', { target: 'ai', locked: true, lockedAt: lockedAt(150) }),
      seat('late', 'player', { target: 'ai', locked: true, lockedAt: lockedAt(400) }),
      seat('open', 'player', { target: 'ai' }),
    ];
    const result = score(seats, { voteLock: true, conversationSeconds: 300 });
    expect(deltaOf(result, 'early')).toBe(SCORE.correctVote + SCORE.earlyLockMaxBonus);
    expect(deltaOf(result, 'half')).toBe(SCORE.correctVote + SCORE.earlyLockMaxBonus / 2);
    expect(deltaOf(result, 'late')).toBe(SCORE.correctVote);
    expect(deltaOf(result, 'open')).toBe(SCORE.correctVote);
  });

  it('gives no lock bonus for a wrong vote', () => {
    const result = score(
      [
        seat('ai', 'master'),
        seat('ana', 'player'),
        seat('beto', 'player', { target: 'ana', locked: true, lockedAt: START.toISOString() }),
      ],
      { voteLock: true },
    );
    expect(deltaOf(result, 'beto')).toBe(SCORE.wrongAccusation);
  });

  it('treats "no AI" as the right answer when there was none', () => {
    const result = score([
      seat('ana', 'player', { target: NO_AI_VOTE }),
      seat('beto', 'player', { target: 'ana' }),
      seat('caio', 'player'),
    ]);
    expect(deltaOf(result, 'ana')).toBe(SCORE.correctVote);
    expect(deltaOf(result, 'beto')).toBe(SCORE.wrongAccusation);
  });

  it('gives zero for "no AI" when there was one', () => {
    const result = score([seat('ai', 'master'), seat('ana', 'player', { target: NO_AI_VOTE })]);
    expect(deltaOf(result, 'ana')).toBe(0);
  });

  it('counts both AIs as correct when there are two', () => {
    const result = score([
      seat('ai1', 'master'),
      seat('ai2', 'master'),
      seat('ana', 'player', { target: 'ai1' }),
      seat('beto', 'player', { target: 'ai2' }),
    ]);
    expect(deltaOf(result, 'ana')).toBe(SCORE.correctVote);
    expect(deltaOf(result, 'beto')).toBe(SCORE.correctVote);
    // Cada IA enganou quem votou na outra.
    expect(deltaOf(result, 'ai1')).toBe(SCORE.perDeceivedPlayer);
    expect(deltaOf(result, 'ai2')).toBe(SCORE.perDeceivedPlayer);
  });
});
