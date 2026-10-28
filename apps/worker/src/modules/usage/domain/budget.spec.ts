import { emptyUsage, evaluateBudget, usageDay } from './budget';

const limits = { dailyMaxCalls: 10, dailyMaxTokens: 1000 };

describe('evaluateBudget', () => {
  it('allows calls while under both limits', () => {
    expect(evaluateBudget({ ...emptyUsage('d'), calls: 9, inputTokens: 900 }, limits)).toEqual({
      allowed: true,
    });
  });

  it('opens the breaker on the call limit', () => {
    expect(evaluateBudget({ ...emptyUsage('d'), calls: 10 }, limits)).toEqual({
      allowed: false,
      reason: 'daily-budget',
    });
  });

  it('opens the breaker on the token limit (input + output)', () => {
    const usage = { ...emptyUsage('d'), inputTokens: 600, outputTokens: 400 };
    expect(evaluateBudget(usage, limits)).toEqual({ allowed: false, reason: 'daily-budget' });
  });

  it('stays open for the rest of the day after a 429', () => {
    const usage = { ...emptyUsage('d'), trippedAt: new Date() };
    expect(evaluateBudget(usage, limits)).toEqual({ allowed: false, reason: 'provider-quota' });
  });

  it('uses the UTC day', () => {
    expect(usageDay(new Date('2026-03-01T23:30:00-03:00'))).toBe('2026-03-02');
  });
});
