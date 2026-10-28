import { join } from 'node:path';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { ChatMessageSchema, GameMatchSchema } from './modules/game/infrastructure/game.schema';
import { ReportSchema } from './modules/moderation/infrastructure/report.schema';
import { PlayerSchema, RoomSchema } from './modules/rooms/infrastructure/rooms.schema';
import { StoredObjectSchema } from './infrastructure/storage/stored-object.schema';

/**
 * Configuração do MikroORM, usada pela aplicação e pela CLI
 * (`npm run migration:create -w @quem/api`).
 *
 * A API é dona do schema "public". O worker tem o próprio schema ("worker")
 * e as próprias migrações: cada serviço cuida dos seus dados.
 */
export default defineConfig({
  clientUrl: process.env.DATABASE_URL ?? 'postgresql://quem:quem@localhost:5432/quem_e_a_ia',
  entities: [
    RoomSchema,
    PlayerSchema,
    GameMatchSchema,
    ChatMessageSchema,
    ReportSchema,
    StoredObjectSchema,
  ],
  extensions: [Migrator],
  migrations: {
    path: join(__dirname, 'migrations'),
    glob: '!(*.d).{js,ts}',
    transactional: true,
    snapshot: false,
    silent: true,
  },
  debug: process.env.DB_DEBUG === 'true',
});
