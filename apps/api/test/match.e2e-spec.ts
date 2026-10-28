import { AiReplyEvent, AiTurnRequestedEvent, BusEvent, MatchFinishedEvent } from '@quem/shared';
import { MatchService } from '../src/modules/game/application/match.service';
import { createRoom, createTestApp, joinRoom, PlayerClient, TestContext } from './test-app';

/** Configurações sem atrasos aleatórios, para o teste ser determinístico. */
const FAST_SETTINGS = {
  typingAndDelay: false,
  messageLimits: false,
  topicAndFlash: false,
  secretAiCount: false,
  masterInterventions: true,
};

describe('Full match (e2e)', () => {
  let ctx: TestContext;
  let clients: PlayerClient[] = [];
  /** Substitui o worker: responde toda mensagem humana como a IA. */
  let fakeWorkerReply: (event: AiTurnRequestedEvent) => Partial<AiReplyEvent> | null;

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.bus.subscribe('ai-turns', async (event: BusEvent) => {
      if (event.type !== 'ai.turn.requested') return;
      const ai = event.aiSeats[0];
      if (!ai || event.trigger.seatId === ai.seatId) return;
      const reply = fakeWorkerReply(event);
      if (!reply) return;
      await ctx.bus.publish('ai-replies', {
        type: 'ai.reply',
        matchId: event.matchId,
        seatId: ai.seatId,
        replyToMessageId: event.trigger.messageId,
        text: 'kkkk sei la, acho que foi o capivara',
        brokeCharacter: false,
        usage: { inputTokens: 10, outputTokens: 5 },
        provider: 'fake',
        ...reply,
      });
    });
    ctx.bus.start();
  });

  beforeEach(() => {
    fakeWorkerReply = () => ({});
  });

  afterEach(() => {
    clients.forEach((c) => c.close());
    clients = [];
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function roomWithPlayers(names: string[], settings: object = FAST_SETTINGS) {
    const host = await createRoom(ctx, names[0]);
    const others = await Promise.all(names.slice(1).map((n) => joinRoom(ctx, host.roomCode, n)));
    clients = await Promise.all([host, ...others].map((j) => PlayerClient.connect(ctx, j)));
    await clients[0].waitFor(
      (c) => c.state?.players.filter((p) => p.connected).length === names.length,
      'todos online',
    );
    expect((await clients[0].emit('room:settings', settings)).ok).toBe(true);
    return clients;
  }

  async function startAndSplit(names = ['Ana', 'Beto', 'Caio', 'Duda'], settings?: object) {
    const players = await roomWithPlayers(names, settings);
    expect((await players[0].emit('match:start')).ok).toBe(true);
    await Promise.all(
      players.map((p) => p.waitFor((c) => c.match?.phase === 'creation', 'fase de criação')),
    );
    const master = players.find((p) => p.match!.role === 'master')!;
    const humans = players.filter((p) => p !== master);
    return { players, master, humans };
  }

  async function writePersona(master: PlayerClient, everyone: PlayerClient[]) {
    const ack = await master.emit('creation:submit', {
      persona: 'Fala tudo em minúsculas, adora capivaras e responde curto.',
    });
    expect(ack.ok).toBe(true);
    await Promise.all(
      everyone.map((p) => p.waitFor((c) => c.match?.phase === 'conversation', 'conversa')),
    );
  }

  it('plays a whole match: creation, chat with the AI, voting, reveal and ranking', async () => {
    const { players, master, humans } = await startAndSplit();

    // Só um Mestre, e ninguém mais sabe quem é.
    expect(players.filter((p) => p.match!.role === 'master')).toHaveLength(1);
    expect(humans.every((h) => h.match!.master === null)).toBe(true);
    expect(humans.every((h) => h.match!.seats.length === 0)).toBe(true);

    const notMaster = await humans[0].emit('creation:submit', {
      persona: 'tentando trapacear aqui',
    });
    expect(notMaster).toMatchObject({ ok: false, error: { code: 'NOT_ALLOWED' } });

    await writePersona(master, players);
    const aiSeatId = master.match!.master!.aiSeatId;
    expect(humans[0].match!.seats).toHaveLength(4);
    expect(humans[0].match!.mySeatId).not.toBe(aiSeatId);

    // Um humano fala; a "IA" (worker falso) responde no lugar do Mestre.
    expect((await humans[0].emit('chat:send', { text: 'quem aqui gosta de capivara?' })).ok).toBe(
      true,
    );
    await humans[1].waitFor(
      (c) => c.messages.some((m) => m.seatId === aiSeatId),
      'resposta da IA no chat',
    );
    const fromHuman = humans[1].messages.find((m) => m.text === 'quem aqui gosta de capivara?');
    expect(fromHuman?.seatId).toBe(humans[0].match!.mySeatId);
    expect(fromHuman).not.toHaveProperty('reveal');

    // O Mestre não digita, mas pode intervir.
    expect(await master.emit('chat:send', { text: 'oi' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_ALLOWED' },
    });
    expect((await master.emit('master:intervene', { text: 'eu nao sou robo hein' })).ok).toBe(true);
    await humans[2].waitFor(
      (c) => c.messages.some((m) => m.text === 'eu nao sou robo hein' && m.seatId === aiSeatId),
      'intervenção do Mestre',
    );
    await master.waitFor((c) => c.match?.master?.interventionsLeft === 2, 'intervenção gasta');

    // Fim da conversa (sem esperar o timer) e votação.
    await ctx.app.get(MatchService).forceAdvance(roomIdOf(master));
    await Promise.all(players.map((p) => p.waitFor((c) => c.match?.phase === 'voting', 'votação')));

    const [finder, fooled, abstainer] = humans;
    expect((await finder.emit('vote:cast', { target: aiSeatId })).ok).toBe(true);
    expect((await fooled.emit('vote:cast', { target: finder.match!.mySeatId! })).ok).toBe(true);
    expect(await master.emit('vote:cast', { target: aiSeatId })).toMatchObject({ ok: false });
    expect((await abstainer.emit('vote:cast', { target: aiSeatId })).ok).toBe(true);

    // Todos votaram: a revelação vem antes do prazo.
    await Promise.all(
      players.map((p) => p.waitFor((c) => c.match?.phase === 'reveal', 'revelação')),
    );
    const reveal = finder.match!.reveal!;
    expect(reveal.aiSeatIds).toEqual([aiSeatId]);
    expect(reveal.masters[0]).toMatchObject({
      playerId: master.playerId,
      persona: expect.stringContaining('capivaras'),
      deceived: 1,
    });
    const scoreOf = (p: PlayerClient) =>
      reveal.scores.find((s) => s.playerId === p.playerId)!.delta;
    expect(scoreOf(finder)).toBe(100);
    expect(scoreOf(fooled)).toBe(-50);
    expect(scoreOf(master)).toBe(50);

    // Histórico revelado: as mensagens da IA e a intervenção aparecem marcadas.
    await finder.waitFor(
      (c) => c.messages.every((m) => m.reveal !== undefined),
      'histórico revelado',
    );
    const aiMessages = finder.messages.filter((m) => m.reveal?.isAi);
    expect(aiMessages.length).toBeGreaterThanOrEqual(2);
    expect(aiMessages.some((m) => m.reveal?.isIntervention)).toBe(true);

    // Fim de partida: auditoria no S3 e evento para o ranking (fan-out SNS).
    expect([...ctx.storage.objects.keys()].some((k) => k.startsWith('matches/'))).toBe(true);
    const finished = ctx.bus.published.find((p) => p.event.type === 'match.finished');
    expect(finished?.topic).toBe('match-events');
    expect((finished!.event as MatchFinishedEvent).correctVoters).toBe(2);

    await finder.waitFor(
      (c) => c.state?.players.find((p) => p.id === finder.playerId)?.totalScore === 100,
      'ranking acumulado',
    );
  });

  it('lets the master review the next AI reply before it is sent', async () => {
    const { players, master, humans } = await startAndSplit(['Ana', 'Beto', 'Caio']);
    await writePersona(master, players);
    const aiSeatId = master.match!.master!.aiSeatId;

    expect((await master.emit('master:review-next', { enabled: true })).ok).toBe(true);
    await humans[0].emit('chat:send', { text: 'e ai, alguem ai?' });
    await master.waitFor((c) => c.drafts.length === 1, 'rascunho para o Mestre');
    expect(humans[1].messages.some((m) => m.seatId === aiSeatId)).toBe(false);

    const { draftId } = master.drafts[0];
    expect(
      (await master.emit('master:approve-draft', { draftId, text: 'to aqui sim kkk' })).ok,
    ).toBe(true);
    await humans[1].waitFor(
      (c) => c.messages.some((m) => m.seatId === aiSeatId && m.text === 'to aqui sim kkk'),
      'resposta editada',
    );
    await master.waitFor((c) => c.match?.master?.interventionsLeft === 2, 'edição conta');
  });

  it('ends the conversation cleanly when the AI budget runs out', async () => {
    const { players, master, humans } = await startAndSplit(['Ana', 'Beto', 'Caio']);
    await writePersona(master, players);

    fakeWorkerReply = () => null;
    await ctx.bus.publish('ai-replies', {
      type: 'ai.unavailable',
      matchId: master.match!.id,
      reason: 'daily-budget',
    });

    await Promise.all(players.map((p) => p.waitFor((c) => c.match?.phase === 'voting', 'votação')));
    expect(humans[0].match!.aiResting).toBe(true);
    await humans[0].waitFor(
      (c) => c.messages.some((m) => m.kind === 'system' && m.text.includes('descansando')),
      'aviso de IA descansando',
    );
  });

  it('puts late arrivals in the audience until the next match', async () => {
    const { players } = await startAndSplit(['Ana', 'Beto', 'Caio']);
    const late = await joinRoom(ctx, players[0].state!.code, 'Eva');
    const lateClient = await PlayerClient.connect(ctx, late);
    clients.push(lateClient);

    await lateClient.waitFor((c) => c.match?.role === 'spectator', 'espectador');
    expect(await lateClient.emit('chat:send', { text: 'oi' })).toMatchObject({ ok: false });
  });

  it('refuses to start without enough players', async () => {
    const [host] = await roomWithPlayers(['Ana', 'Beto']);
    expect(await host.emit('match:start')).toMatchObject({
      ok: false,
      error: { code: 'NOT_ENOUGH_PLAYERS' },
    });
  });
});

/** O id da sala não vai para o cliente; buscamos pelo token (payload do JWT). */
function roomIdOf(client: PlayerClient): string {
  const payload = JSON.parse(
    Buffer.from(client.joined.token.split('.')[1], 'base64url').toString(),
  );
  return payload.room as string;
}
