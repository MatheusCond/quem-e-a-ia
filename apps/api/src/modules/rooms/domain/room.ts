import { randomUUID } from 'node:crypto';
import { DEFAULT_ROOM_SETTINGS, RoomSettings, sanitizeRoomSettings } from '@quem/shared';
import { GameError } from '../../../shared/game-error';
import { Random } from '../../../shared/random';

/** Sem 0/O, 1/I/L: o código é ditado em voz alta e digitado no celular. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateRoomCode(random: Random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Uma sala reúne um grupo de amigos e sobrevive a várias partidas.
 * Classe pura: o mapeamento para o banco fica em infrastructure/room.schema.ts.
 */
export class Room {
  id: string;
  code: string;
  hostPlayerId: string | null;
  settings: RoomSettings;
  createdAt: Date;

  static create(code: string, now = new Date()): Room {
    const room = new Room();
    room.id = randomUUID();
    room.code = code;
    room.hostPlayerId = null;
    room.settings = { ...DEFAULT_ROOM_SETTINGS };
    room.createdAt = now;
    return room;
  }

  isHost(playerId: string): boolean {
    return this.hostPlayerId === playerId;
  }

  updateSettings(playerId: string, input: unknown): void {
    if (!this.isHost(playerId)) {
      throw new GameError('NOT_HOST', 'Só quem criou a sala pode mudar as configurações.');
    }
    this.settings = sanitizeRoomSettings(input, this.settings);
  }
}
