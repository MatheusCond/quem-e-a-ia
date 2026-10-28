import { EntitySchema } from '@mikro-orm/core';
import { ChatMessage } from '../domain/chat-message';
import { GameMatch } from '../domain/game-match';

/**
 * Os lugares (seats), o resultado e a pergunta-relâmpago ficam em colunas
 * JSON: são sempre lidos e gravados junto com a partida, então uma tabela
 * separada só traria joins sem ganho.
 */
export const GameMatchSchema = new EntitySchema<GameMatch>({
  class: GameMatch,
  tableName: 'matches',
  uniques: [{ properties: ['roomId', 'number'] }],
  indexes: [{ properties: ['roomId', 'startedAt'] }, { properties: ['phase'] }],
  properties: {
    id: { type: 'uuid', primary: true },
    roomId: { type: 'uuid' },
    number: { type: 'integer' },
    phase: { type: 'string', length: 20 },
    phaseEndsAt: { type: 'datetime', nullable: true },
    settings: { type: 'json' },
    seats: { type: 'json' },
    aiCount: { type: 'integer' },
    theme: { type: 'string', length: 200, nullable: true },
    flash: { type: 'json', nullable: true },
    aiResting: { type: 'boolean', default: false },
    startedAt: { type: 'datetime' },
    conversationStartedAt: { type: 'datetime', nullable: true },
    finishedAt: { type: 'datetime', nullable: true },
    scores: { type: 'json', nullable: true },
    auditKey: { type: 'string', length: 200, nullable: true },
    rankingApplied: { type: 'boolean', default: false },
  },
});

export const ChatMessageSchema = new EntitySchema<ChatMessage>({
  class: ChatMessage,
  tableName: 'messages',
  indexes: [{ properties: ['matchId', 'visibleAt'] }],
  properties: {
    id: { type: 'uuid', primary: true },
    matchId: { type: 'uuid' },
    seatId: { type: 'uuid', nullable: true },
    kind: { type: 'string', length: 10 },
    text: { type: 'text' },
    isAi: { type: 'boolean', default: false },
    isIntervention: { type: 'boolean', default: false },
    brokeCharacter: { type: 'boolean', default: false },
    createdAt: { type: 'datetime' },
    visibleAt: { type: 'datetime' },
  },
});
