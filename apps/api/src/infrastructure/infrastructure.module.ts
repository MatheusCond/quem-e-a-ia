import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ApiKeyCipher, createMessageBus, MessageBus } from '@quem/cloud';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { RANDOM } from '../shared/random';
import { RoomTransaction } from './database/room-transaction';
import { Scheduler } from './scheduler';
import { ObjectStorage, S3ObjectStorage } from './storage/object-storage';
import { PostgresObjectStorage } from './storage/postgres-object-storage';

export const MESSAGE_BUS = Symbol('MESSAGE_BUS');

/**
 * Peças de infraestrutura usadas por todos os módulos: banco, fila, S3,
 * timers e aleatoriedade. A fila e o armazenamento seguem a configuração
 * (AWS no docker compose, memória e Postgres no modo processo único). Nos
 * testes, os dois são trocados por versões em memória com overrideProvider.
 */
@Global()
@Module({
  providers: [
    RoomTransaction,
    Scheduler,
    { provide: RANDOM, useValue: Math.random },
    {
      provide: MESSAGE_BUS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createMessageBus(config.messageBus, {
          connection: config.aws,
          logger: new Logger('MessageBus'),
        }),
    },
    {
      provide: ObjectStorage,
      inject: [APP_CONFIG, EntityManager],
      useFactory: (config: AppConfig, em: EntityManager) =>
        config.objectStorage === 'postgres'
          ? new PostgresObjectStorage(em)
          : new S3ObjectStorage(config.aws, config.bucket),
    },
    {
      provide: ApiKeyCipher,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new ApiKeyCipher(config.byokEncryptionKey),
    },
  ],
  exports: [RoomTransaction, Scheduler, RANDOM, MESSAGE_BUS, ObjectStorage, ApiKeyCipher],
})
export class InfrastructureModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(MESSAGE_BUS) private readonly bus: MessageBus) {}

  /** Os consumidores se registram no init dos módulos; aqui as filas começam a ser lidas. */
  onApplicationBootstrap(): void {
    this.bus.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bus.stop();
  }
}
