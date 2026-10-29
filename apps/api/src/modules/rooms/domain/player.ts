import { randomUUID } from 'node:crypto';
import { findBlockedTerm, GAME_RULES } from '@quem/shared';
import { GameError } from '../../../shared/game-error';

export function normalizeNickname(input: string): string {
  const nickname = input.replace(/\s+/g, ' ').trim();
  if (nickname.length === 0) {
    throw new GameError('VALIDATION', 'Escolha um apelido.');
  }
  if (nickname.length > GAME_RULES.maxNicknameChars) {
    throw new GameError(
      'VALIDATION',
      `O apelido pode ter até ${GAME_RULES.maxNicknameChars} caracteres.`,
    );
  }
  if (findBlockedTerm(nickname)) {
    throw new GameError('BLOCKED_CONTENT', 'Esse apelido não é permitido.');
  }
  return nickname;
}

/** Nome escolhido para o chat. Vazio volta ao sorteio. */
export function normalizeChatName(input: string): string | null {
  const name = input.replace(/\s+/g, ' ').trim();
  if (name.length === 0) return null;
  if (name.length > GAME_RULES.maxNicknameChars) {
    throw new GameError(
      'VALIDATION',
      `O nome no chat pode ter até ${GAME_RULES.maxNicknameChars} caracteres.`,
    );
  }
  if (findBlockedTerm(name)) {
    throw new GameError('BLOCKED_CONTENT', 'Esse nome não é permitido.');
  }
  return name;
}

/** Um amigo dentro de uma sala. A pontuação acumula entre as partidas. */
export class Player {
  id: string;
  roomId: string;
  nickname: string;
  /** Nome usado no chat das próximas partidas; null sorteia um pseudônimo. */
  chatName: string | null;
  avatarKey: string | null;
  totalScore: number;
  joinedAt: Date;

  static create(roomId: string, nickname: string, now = new Date()): Player {
    const player = new Player();
    player.id = randomUUID();
    player.roomId = roomId;
    player.nickname = normalizeNickname(nickname);
    player.chatName = null;
    player.avatarKey = null;
    player.totalScore = 0;
    player.joinedAt = now;
    return player;
  }
}
