import { MikroORM } from '@mikro-orm/postgresql';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/** Usado pelo healthcheck do docker compose e por um balanceador de carga. */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly orm: MikroORM) {}

  @Get()
  async check() {
    if (!(await this.orm.isConnected())) {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok' };
  }
}
