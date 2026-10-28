/**
 * Disjuntor de orçamento diário.
 *
 * Todas as chamadas ao LLM com a chave do servidor somam num contador do
 * dia (UTC). Quando passa do limite de chamadas ou de tokens, ou quando o
 * provedor responde 429 (cota esgotada), o disjuntor "abre" e a IA para até
 * o dia seguinte. As salas recebem "A IA está descansando".
 */
export interface DailyUsage {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Preenchido quando o provedor devolveu 429. */
  trippedAt: Date | null;
}

export interface BudgetLimits {
  dailyMaxCalls: number;
  dailyMaxTokens: number;
}

export type BudgetVerdict =
  { allowed: true } | { allowed: false; reason: 'daily-budget' | 'provider-quota' };

export function evaluateBudget(usage: DailyUsage, limits: BudgetLimits): BudgetVerdict {
  if (usage.trippedAt) return { allowed: false, reason: 'provider-quota' };
  const tokens = usage.inputTokens + usage.outputTokens;
  if (usage.calls >= limits.dailyMaxCalls || tokens >= limits.dailyMaxTokens) {
    return { allowed: false, reason: 'daily-budget' };
  }
  return { allowed: true };
}

/** Dia do contador, sempre em UTC para não depender do fuso do servidor. */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function emptyUsage(day: string): DailyUsage {
  return { day, calls: 0, inputTokens: 0, outputTokens: 0, trippedAt: null };
}
