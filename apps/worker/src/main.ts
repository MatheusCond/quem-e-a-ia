import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WORKER_CONFIG, WorkerConfig } from './config/worker-config';
import { WorkerModule } from './worker.module';

/**
 * O worker é um processo separado da API: consome as filas SQS e expõe só
 * /health e /stats. Pode ter várias réplicas; o SQS distribui as mensagens.
 */
async function bootstrap() {
  const app = await NestFactory.create(WorkerModule);
  const config = app.get<WorkerConfig>(WORKER_CONFIG);

  if (process.env.RUN_MIGRATIONS !== 'false') {
    const orm = app.get(MikroORM);
    // A tabela de controle das migrações fica dentro do schema, então ele precisa existir antes.
    await orm.em.getConnection().execute('create schema if not exists worker');
    const migrated = await orm.getMigrator().up();
    if (migrated.length) Logger.log(`${migrated.length} migração(ões) aplicada(s)`, 'Database');
  }

  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`Worker pronto (HTTP interno na porta ${config.port})`, 'Bootstrap');
}

void bootstrap();
