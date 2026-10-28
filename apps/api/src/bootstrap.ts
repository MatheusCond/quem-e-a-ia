import { MikroORM } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { configureApp } from './configure-app';
import { serveWebApp } from './infrastructure/http/web-app';

/**
 * Sobe a API. Fica separado do main.ts para o modo processo único
 * (deploy/standalone) poder subir a API e o worker no mesmo Node.
 */
export async function startApi(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  if (process.env.RUN_MIGRATIONS !== 'false') {
    const migrated = await app.get(MikroORM).getMigrator().up();
    if (migrated.length) Logger.log(`${migrated.length} migração(ões) aplicada(s)`, 'Database');
  }

  configureApp(app, config);
  if (config.webDistDir) serveWebApp(app, config.webDistDir);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API ouvindo na porta ${config.port}`, 'Bootstrap');
  return app;
}
