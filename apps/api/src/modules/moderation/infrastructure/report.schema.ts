import { EntitySchema } from '@mikro-orm/core';
import { Report } from '../domain/report';

export const ReportSchema = new EntitySchema<Report>({
  class: Report,
  tableName: 'reports',
  indexes: [{ properties: ['matchId'] }],
  properties: {
    id: { type: 'uuid', primary: true },
    matchId: { type: 'uuid' },
    messageId: { type: 'uuid' },
    reporterPlayerId: { type: 'uuid' },
    reason: { type: 'string', length: 200 },
    createdAt: { type: 'datetime' },
  },
});
