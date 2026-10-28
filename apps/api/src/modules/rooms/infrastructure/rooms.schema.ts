import { EntitySchema } from '@mikro-orm/core';
import { Player } from '../domain/player';
import { Room } from '../domain/room';

/**
 * Mapeamento das classes de domínio para tabelas.
 *
 * Usamos EntitySchema em vez de decorators (@Entity, @Property) para manter o
 * domínio livre do ORM. Em JPA seria o equivalente a mapear tudo no orm.xml
 * em vez de anotar as classes.
 *
 * As referências entre agregados são só ids (roomId), sem relação do ORM:
 * cada agregado é carregado e salvo por inteiro, sem lazy loading escondido.
 */
export const RoomSchema = new EntitySchema<Room>({
  class: Room,
  tableName: 'rooms',
  properties: {
    id: { type: 'uuid', primary: true },
    code: { type: 'string', length: 8, unique: true },
    hostPlayerId: { type: 'uuid', nullable: true },
    settings: { type: 'json' },
    createdAt: { type: 'datetime' },
  },
});

export const PlayerSchema = new EntitySchema<Player>({
  class: Player,
  tableName: 'players',
  indexes: [{ properties: ['roomId'] }],
  properties: {
    id: { type: 'uuid', primary: true },
    roomId: { type: 'uuid' },
    nickname: { type: 'string', length: 40 },
    avatarKey: { type: 'string', length: 120, nullable: true },
    totalScore: { type: 'integer', default: 0 },
    joinedAt: { type: 'datetime' },
  },
});
