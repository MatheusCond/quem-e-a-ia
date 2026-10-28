/**
 * Tabelas do worker (schema "worker" no Postgres). O worker é dono destes
 * dados; a API não lê nem escreve aqui.
 */

/** Contador diário do disjuntor. */
export class DailyUsageRecord {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  trippedAt: Date | null;
}

/** Quanto cada partida gastou de IA (chamadas e tokens). */
export class MatchUsageRecord {
  matchId: string;
  provider: string;
  calls: number;
  ownKeyCalls: number;
  inputTokens: number;
  outputTokens: number;
  updatedAt: Date;
}

/** Fotografia da partida no fim, para as métricas do README. */
export class MatchStatsRecord {
  matchId: string;
  roomCode: string;
  provider: string | null;
  aiCount: number;
  playerCount: number;
  durationSeconds: number;
  correctVoters: number;
  totalVoters: number;
  aiMessages: number;
  humanMessages: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  auditKey: string | null;
  finishedAt: Date;
}
