import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  if (process.env.RUN_MIGRATIONS !== 'false') {
    const migrated = await app.get(MikroORM).getMigrator().up();
    if (migrated.length) Logger.log(`${migrated.length} migração(ões) aplicada(s)`, 'Database');
  }

  configureApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API ouvindo na porta ${config.port}`, 'Bootstrap');
}

void bootstrap();
