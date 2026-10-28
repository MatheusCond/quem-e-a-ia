import { EntitySchema } from '@mikro-orm/core';
import { DailyUsageRecord, MatchStatsRecord, MatchUsageRecord } from '../domain/usage-records';

export const DailyUsageSchema = new EntitySchema<DailyUsageRecord>({
  class: DailyUsageRecord,
  tableName: 'daily_usage',
  properties: {
    day: { type: 'string', length: 10, primary: true },
    calls: { type: 'integer', default: 0 },
    inputTokens: { type: 'integer', default: 0 },
    outputTokens: { type: 'integer', default: 0 },
    trippedAt: { type: 'datetime', nullable: true },
  },
});

export const MatchUsageSchema = new EntitySchema<MatchUsageRecord>({
  class: MatchUsageRecord,
  tableName: 'match_usage',
  properties: {
    matchId: { type: 'uuid', primary: true },
    provider: { type: 'string', length: 20 },
    calls: { type: 'integer', default: 0 },
    ownKeyCalls: { type: 'integer', default: 0 },
    inputTokens: { type: 'integer', default: 0 },
    outputTokens: { type: 'integer', default: 0 },
    updatedAt: { type: 'datetime' },
  },
});

export const MatchStatsSchema = new EntitySchema<MatchStatsRecord>({
  class: MatchStatsRecord,
  tableName: 'match_stats',
  properties: {
    matchId: { type: 'uuid', primary: true },
    roomCode: { type: 'string', length: 8 },
    provider: { type: 'string', length: 20, nullable: true },
    aiCount: { type: 'integer' },
    playerCount: { type: 'integer' },
    durationSeconds: { type: 'integer' },
    correctVoters: { type: 'integer' },
    totalVoters: { type: 'integer' },
    aiMessages: { type: 'integer' },
    humanMessages: { type: 'integer' },
    calls: { type: 'integer' },
    inputTokens: { type: 'integer' },
    outputTokens: { type: 'integer' },
    auditKey: { type: 'string', length: 200, nullable: true },
    finishedAt: { type: 'datetime' },
  },
});
