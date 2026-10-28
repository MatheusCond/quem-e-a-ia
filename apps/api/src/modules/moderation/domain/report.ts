import { randomUUID } from 'node:crypto';
import { GameError } from '../../../shared/game-error';

const MAX_REASON_CHARS = 200;

/** Denúncia de uma mensagem. Fica no banco para revisão manual. */
export class Report {
  id: string;
  matchId: string;
  messageId: string;
  reporterPlayerId: string;
  reason: string;
  createdAt: Date;

  static create(params: {
    matchId: string;
    messageId: string;
    reporterPlayerId: string;
    reason: string;
    now?: Date;
  }): Report {
    const reason = String(params.reason ?? '')
      .trim()
      .slice(0, MAX_REASON_CHARS);
    if (!reason) throw new GameError('VALIDATION', 'Conte o motivo da denúncia.');

    const report = new Report();
    report.id = randomUUID();
    report.matchId = params.matchId;
    report.messageId = params.messageId;
    report.reporterPlayerId = params.reporterPlayerId;
    report.reason = reason;
    report.createdAt = params.now ?? new Date();
    return report;
  }
}
