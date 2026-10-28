import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Logger, Module } from '@nestjs/common';
import { ApiKeyCipher, AwsMessageBus } from '@quem/cloud';
import { ConfigModule } from './config/config.module';
import { WORKER_CONFIG, WorkerConfig } from './config/worker-config';
import { WorkerHttpController } from './infrastructure/http.controller';
import { QueueConsumers } from './infrastructure/queue-consumers';
import { MESSAGE_BUS, RANDOM } from './infrastructure/tokens';
import ormConfig from './mikro-orm.config';
import { AiTurnHandler } from './modules/ai-turn/application/ai-turn.handler';
import { LlmProvider } from './modules/ai-turn/infrastructure/llm/llm-provider';
import { createDefaultProvider } from './modules/ai-turn/infrastructure/llm/llm-provider.factory';
import { BudgetService } from './modules/usage/application/budget.service';
import { MatchStatsHandler } from './modules/usage/application/match-stats.handler';
import { UsageRepository } from './modules/usage/application/usage-repository';
import { PostgresUsageRepository } from './modules/usage/infrastructure/postgres-usage.repository';

@Module({
  imports: [
    ConfigModule,
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [WORKER_CONFIG],
      useFactory: (config: WorkerConfig) => ({ ...ormConfig, clientUrl: config.databaseUrl }),
    }),
  ],
  controllers: [WorkerHttpController],
  providers: [
    {
      provide: LlmProvider,
      inject: [WORKER_CONFIG],
      useFactory: (config: WorkerConfig) => createDefaultProvider(config),
    },
    {
      provide: MESSAGE_BUS,
      inject: [WORKER_CONFIG],
      useFactory: (config: WorkerConfig) =>
        new AwsMessageBus({ connection: config.aws, logger: new Logger('MessageBus') }),
    },
    {
      provide: ApiKeyCipher,
      inject: [WORKER_CONFIG],
      useFactory: (config: WorkerConfig) => new ApiKeyCipher(config.byokEncryptionKey),
    },
    { provide: RANDOM, useValue: Math.random },
    { provide: UsageRepository, useClass: PostgresUsageRepository },
    BudgetService,
    AiTurnHandler,
    MatchStatsHandler,
    QueueConsumers,
  ],
})
export class WorkerModule {}
