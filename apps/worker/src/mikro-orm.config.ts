import { join } from 'node:path';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import {
  DailyUsageSchema,
  MatchStatsSchema,
  MatchUsageSchema,
} from './modules/usage/infrastructure/usage.schema';

/**
 * O worker usa o mesmo Postgres que a API, mas num schema próprio
 * ("worker"), com migrações próprias. Cada serviço é dono dos seus dados.
 */
export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? 'postgresql://quem:quem@localhost:5432/quem_e_a_ia',
  schema: 'worker',
  entities: [DailyUsageSchema, MatchUsageSchema, MatchStatsSchema],
  extensions: [Migrator],
  migrations: {
    path: join(__dirname, 'migrations'),
    glob: '!(*.d).{js,ts}',
    tableName: 'worker_migrations',
    transactional: true,
    snapshot: false,
    silent: true,
  },
  debug: process.env.DB_DEBUG === 'true',
});
