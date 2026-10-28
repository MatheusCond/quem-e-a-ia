import { MikroORM } from '@mikro-orm/postgresql';
import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WORKER_CONFIG, WorkerConfig } from './config/worker-config';
import { WorkerModule } from './worker.module';

export interface StartWorkerOptions {
  /**
   * Abre o HTTP interno (/health e /stats). No modo processo único fica
   * desligado: a plataforma expõe só uma porta, que é da API.
   */
  listen?: boolean;
}

/**
 * Sobe o worker. Fica separado do main.ts para o modo processo único
 * (deploy/standalone) poder subir a API e o worker no mesmo Node.
 */
export async function startWorker({
  listen = true,
}: StartWorkerOptions = {}): Promise<INestApplication> {
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
  if (listen) {
    await app.listen(config.port, '0.0.0.0');
    Logger.log(`Worker pronto (HTTP interno na porta ${config.port})`, 'Bootstrap');
  } else {
    await app.init();
    Logger.log('Worker pronto (sem HTTP próprio)', 'Bootstrap');
  }
  return app;
}
