import { AiSeatContext, AiTurnRequestedEvent } from '@quem/shared';

/** Evento de exemplo para os testes do worker. */
export function aiSeat(overrides: Partial<AiSeatContext> = {}): AiSeatContext {
  return {
    seatId: 'seat-ai',
    pseudonym: 'Capivara Zen',
    persona: 'Fala tudo em minúsculas e adora pastel.',
    mirrorSamples: [],
    repliesSoFar: 0,
    lastMessageAt: null,
    encryptedApiKey: null,
    ...overrides,
  };
}

export function turnEvent(overrides: Partial<AiTurnRequestedEvent> = {}): AiTurnRequestedEvent {
  return {
    type: 'ai.turn.requested',
    matchId: 'match-1',
    trigger: { kind: 'message', messageId: 'msg-1', seatId: 'seat-human', text: 'bom dia gente' },
    aiSeats: [aiSeat()],
    pseudonyms: ['Capivara Zen', 'Pastel de Vento', 'Tatu-Bola'],
    recentMessages: [{ seatId: 'seat-human', pseudonym: 'Pastel de Vento', text: 'bom dia gente' }],
    theme: null,
    settings: { selectiveReplies: true, maxChars: 160 },
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}
