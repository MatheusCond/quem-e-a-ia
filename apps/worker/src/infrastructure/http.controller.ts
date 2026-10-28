import { MikroORM } from '@mikro-orm/postgresql';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { WORKER_CONFIG, WorkerConfig } from '../config/worker-config';
import { LlmProvider } from '../modules/ai-turn/infrastructure/llm/llm-provider';
import { BudgetService } from '../modules/usage/application/budget.service';
import { UsageRepository } from '../modules/usage/application/usage-repository';
import { DailyUsage } from '../modules/usage/domain/budget';

/**
 * HTTP interno do worker: saúde e métricas de custo. Não é exposto ao
 * navegador (o nginx do front-end não encaminha para cá).
 */
@Controller()
export class WorkerHttpController {
  constructor(
    private readonly orm: MikroORM,
    private readonly repository: UsageRepository,
    private readonly budget: BudgetService,
    private readonly provider: LlmProvider,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  @Get('health')
  async health() {
    if (!(await this.orm.isConnected())) throw new ServiceUnavailableException();
    return { status: 'ok', provider: this.provider.name };
  }

  /** Médias reais por partida e situação do disjuntor hoje. */
  @Get('stats')
  async stats() {
    const today: DailyUsage = await this.repository.getDaily(new Date().toISOString().slice(0, 10));
    return {
      provider: this.provider.name,
      today: {
        ...today,
        limits: {
          calls: this.config.limits.dailyMaxCalls,
          tokens: this.config.limits.dailyMaxTokens,
        },
        breaker: await this.budget.check(),
      },
      matches: await this.repository.summary(),
    };
  }
}
