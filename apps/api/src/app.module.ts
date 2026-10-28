import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { GameErrorFilter } from './infrastructure/http/game-error.filter';
import { HealthController } from './infrastructure/http/health.controller';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import ormConfig from './mikro-orm.config';
import { AuthModule } from './modules/auth/auth.module';
import { GameModule } from './modules/game/game.module';
import { RoomsModule } from './modules/rooms/rooms.module';

@Module({
  imports: [
    ConfigModule,
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({ ...ormConfig, clientUrl: config.databaseUrl }),
    }),
    // Limite por IP nas rotas REST (criar e entrar em sala, upload).
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        { ttl: 60_000, limit: config.limits.requestsPerMinutePerIp },
      ],
    }),
    EventEmitterModule.forRoot(),
    InfrastructureModule,
    AuthModule,
    RoomsModule,
    GameModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GameErrorFilter },
  ],
})
export class AppModule {}
