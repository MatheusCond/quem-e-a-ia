import { Global, Module } from '@nestjs/common';
import { loadWorkerConfig, WORKER_CONFIG } from './worker-config';

@Global()
@Module({
  providers: [{ provide: WORKER_CONFIG, useFactory: () => loadWorkerConfig() }],
  exports: [WORKER_CONFIG],
})
export class ConfigModule {}
