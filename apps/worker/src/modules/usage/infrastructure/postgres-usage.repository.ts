import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { MatchFinishedEvent } from '@quem/shared';
import { CallUsage, StatsSummary, UsageRepository } from '../application/usage-repository';
import { DailyUsage, emptyUsage } from '../domain/budget';
import { DailyUsageRecord, MatchStatsRecord, MatchUsageRecord } from '../domain/usage-records';

/**
 * Persistência no Postgres. Os contadores usam "INSERT ... ON CONFLICT DO
 * UPDATE SET calls = calls + 1": o incremento acontece dentro do banco,
 * então dois workers somando ao mesmo tempo não perdem nenhuma chamada.
 * Ler, somar no Node e gravar de volta teria essa condição de corrida.
 */
@Injectable()
export class PostgresUsageRepository extends UsageRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async getDaily(day: string): Promise<DailyUsage> {
    const record = await this.em.fork().findOne(DailyUsageRecord, { day });
    return record ? { ...record } : emptyUsage(day);
  }

  async recordCall(day: string, usage: CallUsage): Promise<void> {
    const connection = this.em.getConnection();
    const serverCalls = usage.ownKey ? 0 : 1;
    const serverIn = usage.ownKey ? 0 : usage.inputTokens;
    const serverOut = usage.ownKey ? 0 : usage.outputTokens;

    await connection.execute(
      `insert into worker.daily_usage (day, calls, input_tokens, output_tokens)
       values (?, ?, ?, ?)
       on conflict (day) do update set
         calls = daily_usage.calls + excluded.calls,
         input_tokens = daily_usage.input_tokens + excluded.input_tokens,
         output_tokens = daily_usage.output_tokens + excluded.output_tokens`,
      [day, serverCalls, serverIn, serverOut],
    );
    await connection.execute(
      `insert into worker.match_usage
         (match_id, provider, calls, own_key_calls, input_tokens, output_tokens, updated_at)
       values (?, ?, 1, ?, ?, ?, now())
       on conflict (match_id) do update set
         provider = excluded.provider,
         calls = match_usage.calls + 1,
         own_key_calls = match_usage.own_key_calls + excluded.own_key_calls,
         input_tokens = match_usage.input_tokens + excluded.input_tokens,
         output_tokens = match_usage.output_tokens + excluded.output_tokens,
         updated_at = now()`,
      [usage.matchId, usage.provider, usage.ownKey ? 1 : 0, usage.inputTokens, usage.outputTokens],
    );
  }

  async tripDaily(day: string, at: Date): Promise<void> {
    await this.em.getConnection().execute(
      `insert into worker.daily_usage (day, tripped_at) values (?, ?)
       on conflict (day) do update set tripped_at = excluded.tripped_at`,
      [day, at],
    );
  }

  /** Idempotente: se o evento chegar duas vezes, a segunda é ignorada. */
  async saveMatchStats(event: MatchFinishedEvent): Promise<void> {
    const em = this.em.fork();
    if (await em.findOne(MatchStatsRecord, { matchId: event.matchId })) return;
    const usage = await em.findOne(MatchUsageRecord, { matchId: event.matchId });

    const stats = em.create(MatchStatsRecord, {
      matchId: event.matchId,
      roomCode: event.roomCode,
      provider: usage?.provider ?? null,
      aiCount: event.aiCount,
      playerCount: event.playerCount,
      durationSeconds: Math.round(
        (Date.parse(event.finishedAt) - Date.parse(event.startedAt)) / 1000,
      ),
      correctVoters: event.correctVoters,
      totalVoters: event.totalVoters,
      aiMessages: event.aiMessages,
      humanMessages: event.humanMessages,
      calls: usage?.calls ?? 0,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      auditKey: event.auditKey,
      finishedAt: new Date(event.finishedAt),
    });
    await em.persistAndFlush(stats);
  }

  async summary(): Promise<StatsSummary> {
    const [row] = await this.em.getConnection().execute<Array<Record<string, string | null>>>(
      `select
         count(*) as matches,
         count(*) filter (where ai_count > 0) as matches_with_ai,
         avg(calls) filter (where ai_count > 0) as calls,
         avg(input_tokens) filter (where ai_count > 0) as input_tokens,
         avg(output_tokens) filter (where ai_count > 0) as output_tokens,
         avg(ai_messages) filter (where ai_count > 0) as ai_messages,
         avg(duration_seconds) as duration,
         sum(correct_voters) as correct,
         sum(total_voters) as voters,
         array_to_string(array_agg(distinct provider) filter (where provider is not null), ',') as providers
       from worker.match_stats`,
    );
    const num = (value: string | null | undefined) => (value == null ? 0 : Number(value));
    const round = (value: number) => Math.round(value * 10) / 10;
    const matchesWithAi = num(row.matches_with_ai);
    const voters = num(row.voters);

    return {
      matches: num(row.matches),
      matchesWithAi,
      providers: row.providers ? row.providers.split(',') : [],
      averages: matchesWithAi
        ? {
            callsPerMatch: round(num(row.calls)),
            inputTokensPerMatch: round(num(row.input_tokens)),
            outputTokensPerMatch: round(num(row.output_tokens)),
            aiMessagesPerMatch: round(num(row.ai_messages)),
            durationSeconds: round(num(row.duration)),
          }
        : null,
      detectionRate: voters ? round((num(row.correct) / voters) * 100) / 100 : null,
    };
  }
}
