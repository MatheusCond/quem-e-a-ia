import { Inject, Injectable, Logger } from '@nestjs/common';
import { WORKER_CONFIG, WorkerConfig } from '../../../config/worker-config';
import { BudgetVerdict, evaluateBudget, usageDay } from '../domain/budget';
import { CallUsage, UsageRepository } from './usage-repository';

/** Aplica o disjuntor de orçamento usando o contador gravado no banco. */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    private readonly repository: UsageRepository,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  async check(now = new Date()): Promise<BudgetVerdict> {
    const usage = await this.repository.getDaily(usageDay(now));
    return evaluateBudget(usage, this.config.limits);
  }

  async record(usage: CallUsage, now = new Date()): Promise<void> {
    await this.repository.recordCall(usageDay(now), usage);
  }

  /** O provedor respondeu 429: abre o disjuntor até o fim do dia. */
  async tripForQuota(now = new Date()): Promise<void> {
    this.logger.warn('Cota do provedor esgotada: IA desligada até amanhã (UTC)');
    await this.repository.tripDaily(usageDay(now), now);
  }
}
