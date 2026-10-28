import { randomBytes } from 'node:crypto';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GAME_RULES } from '@quem/shared';
import { RoomTransaction } from '../../../infrastructure/database/room-transaction';
import { ObjectStorage } from '../../../infrastructure/storage/object-storage';
import { GameError } from '../../../shared/game-error';
import { Random, RANDOM } from '../../../shared/random';
import { PlayerTokenService } from '../../auth/player-token.service';
import { Player } from '../domain/player';
import { generateRoomCode, normalizeRoomCode, Room } from '../domain/room';

export interface JoinResult {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface RoomSummary {
  code: string;
  playerCount: number;
  maxPlayers: number;
}

/** Evento interno: algo visível da sala mudou e os jogadores precisam saber. */
export const ROOM_CHANGED = 'room.changed';
export interface RoomChangedEvent {
  roomId: string;
}

const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class RoomsService {
  constructor(
    private readonly tx: RoomTransaction,
    private readonly tokens: PlayerTokenService,
    private readonly storage: ObjectStorage,
    private readonly events: EventEmitter2,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  /** Cria a sala e o primeiro jogador, que vira o anfitrião. */
  async createRoom(nickname: string): Promise<JoinResult> {
    return this.tx.read(async (em) => {
      const room = Room.create(await this.uniqueCode(em));
      const host = Player.create(room.id, nickname);
      room.hostPlayerId = host.id;
      em.persist([room, host]);
      await em.flush();
      return this.joinResult(room, host);
    });
  }

  /**
   * Entra numa sala existente. Quem entra com a partida em andamento assiste
   * como espectador e joga a próxima.
   */
  async joinRoom(code: string, nickname: string): Promise<JoinResult> {
    const room = await this.tx.read((em) => this.findRoom(em, code));
    return this.tx.run(room.id, async (em) => {
      const players = await em.find(Player, { roomId: room.id });
      if (players.length >= GAME_RULES.maxPlayers) {
        throw new GameError('ROOM_FULL', `A sala já tem ${GAME_RULES.maxPlayers} jogadores.`);
      }
      const player = Player.create(room.id, nickname);
      const taken = players.some((p) => p.nickname.toLowerCase() === player.nickname.toLowerCase());
      if (taken) {
        throw new GameError('VALIDATION', 'Já tem alguém com esse apelido na sala.');
      }
      em.persist(player);
      return this.joinResult(room, player);
    });
  }

  async getSummary(code: string): Promise<RoomSummary> {
    return this.tx.read(async (em) => {
      const room = await this.findRoom(em, code);
      const playerCount = await em.count(Player, { roomId: room.id });
      return { code: room.code, playerCount, maxPlayers: GAME_RULES.maxPlayers };
    });
  }

  /** Guarda a foto no S3 e devolve a URL pública servida pela própria API. */
  async setAvatar(
    auth: { playerId: string; roomId: string },
    file: { buffer: Buffer; mimetype: string },
  ): Promise<{ avatarUrl: string }> {
    const extension = AVATAR_TYPES[file.mimetype];
    if (!extension) throw new GameError('VALIDATION', 'Envie uma imagem JPG, PNG ou WEBP.');

    // Nome novo a cada upload: o navegador não fica com a foto antiga em cache.
    const avatarKey = `${auth.playerId}-${randomBytes(4).toString('hex')}.${extension}`;
    await this.storage.put(`avatars/${avatarKey}`, file.buffer, file.mimetype);

    await this.tx.run(auth.roomId, async (em) => {
      const player = await em.findOneOrFail(Player, { id: auth.playerId });
      player.avatarKey = avatarKey;
    });
    this.events.emit(ROOM_CHANGED, { roomId: auth.roomId } satisfies RoomChangedEvent);
    return { avatarUrl: avatarUrl(avatarKey)! };
  }

  async getAvatar(avatarKey: string) {
    if (!/^[\w-]+\.(jpg|png|webp)$/.test(avatarKey)) return null;
    return this.storage.get(`avatars/${avatarKey}`);
  }

  private async findRoom(em: EntityManager, code: string): Promise<Room> {
    const room = await em.findOne(Room, { code: normalizeRoomCode(code) });
    if (!room) throw new GameError('ROOM_NOT_FOUND', 'Sala não encontrada. Confira o código.');
    return room;
  }

  private async uniqueCode(em: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateRoomCode(this.random);
      if (!(await em.count(Room, { code }))) return code;
    }
    throw new GameError('INTERNAL', 'Não foi possível gerar um código de sala.');
  }

  private joinResult(room: Room, player: Player): JoinResult {
    return {
      roomCode: room.code,
      playerId: player.id,
      token: this.tokens.sign({ playerId: player.id, roomId: room.id }),
    };
  }
}

export function avatarUrl(avatarKey: string | null): string | null {
  return avatarKey ? `/api/avatars/${avatarKey}` : null;
}
