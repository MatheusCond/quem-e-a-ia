import { MatchFinishedEvent } from '@quem/shared';
import { DailyUsage } from '../domain/budget';

export interface CallUsage {
  matchId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  /** Chamada feita com a chave do Mestre: não conta no orçamento do servidor. */
  ownKey: boolean;
}

export interface StatsSummary {
  matches: number;
  matchesWithAi: number;
  providers: string[];
  averages: {
    callsPerMatch: number;
    inputTokensPerMatch: number;
    outputTokensPerMatch: number;
    aiMessagesPerMatch: number;
    durationSeconds: number;
  } | null;
  /** Fração de votos que acertaram a IA, somando todas as partidas. */
  detectionRate: number | null;
}

/**
 * Porta de persistência do worker. A versão Postgres fica em
 * infrastructure/; os testes usam uma versão em memória.
 */
export abstract class UsageRepository {
  abstract getDaily(day: string): Promise<DailyUsage>;
  abstract recordCall(day: string, usage: CallUsage): Promise<void>;
  abstract tripDaily(day: string, at: Date): Promise<void>;
  abstract saveMatchStats(event: MatchFinishedEvent): Promise<void>;
  abstract summary(): Promise<StatsSummary>;
}
