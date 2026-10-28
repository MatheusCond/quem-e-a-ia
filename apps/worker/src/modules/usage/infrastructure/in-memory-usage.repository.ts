import { MatchFinishedEvent } from '@quem/shared';
import { CallUsage, StatsSummary, UsageRepository } from '../application/usage-repository';
import { DailyUsage, emptyUsage } from '../domain/budget';

/** Versão em memória da persistência, usada nos testes unitários. */
export class InMemoryUsageRepository extends UsageRepository {
  readonly daily = new Map<string, DailyUsage>();
  readonly calls: CallUsage[] = [];
  readonly finished: MatchFinishedEvent[] = [];

  async getDaily(day: string): Promise<DailyUsage> {
    return { ...(this.daily.get(day) ?? emptyUsage(day)) };
  }

  async recordCall(day: string, usage: CallUsage): Promise<void> {
    this.calls.push(usage);
    if (usage.ownKey) return;
    const current = this.daily.get(day) ?? emptyUsage(day);
    this.daily.set(day, {
      ...current,
      calls: current.calls + 1,
      inputTokens: current.inputTokens + usage.inputTokens,
      outputTokens: current.outputTokens + usage.outputTokens,
    });
  }

  async tripDaily(day: string, at: Date): Promise<void> {
    this.daily.set(day, { ...(this.daily.get(day) ?? emptyUsage(day)), trippedAt: at });
  }

  async saveMatchStats(event: MatchFinishedEvent): Promise<void> {
    if (!this.finished.some((e) => e.matchId === event.matchId)) this.finished.push(event);
  }

  async summary(): Promise<StatsSummary> {
    return {
      matches: this.finished.length,
      matchesWithAi: 0,
      providers: [],
      averages: null,
      detectionRate: null,
    };
  }
}
