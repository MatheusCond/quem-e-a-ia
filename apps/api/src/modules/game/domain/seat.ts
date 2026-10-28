import { GAME_RULES, RoomSettings, SeatAvatar, VoteTarget } from '@quem/shared';
import { randomUUID } from 'node:crypto';
import { Random, shuffle } from '../../../shared/random';
import { AVATAR_COLORS, AVATAR_EMOJIS, PSEUDONYMS } from './content';

export type SeatRole = 'player' | 'master';

export interface SeatVote {
  target: VoteTarget;
  locked: boolean;
  castAt: string;
  lockedAt: string | null;
}

/**
 * O lugar de um jogador no chat de uma partida. O lugar de um Mestre é
 * ocupado pela IA dele: o pseudônimo é o mesmo, quem escreve é o modelo.
 *
 * Guardado como JSON dentro da partida: é sempre lido junto com ela e
 * nunca consultado sozinho.
 */
export interface Seat {
  id: string;
  playerId: string;
  pseudonym: string;
  avatar: SeatAvatar;
  role: SeatRole;
  lastMessageAt: string | null;
  vote: SeatVote | null;

  // Campos usados só quando role === 'master'
  persona: string | null;
  mirrorSamples: string[];
  submitted: boolean;
  usingOwnKey: boolean;
  interventionsLeft: number;
  reviewNext: boolean;
  aiReplies: number;
  brokeCharacter: boolean;
}

/**
 * Pesos para o número secreto de IAs: uma IA é o mais comum, mas zero e
 * duas aparecem o bastante para ninguém poder contar com isso.
 */
const AI_COUNT_WEIGHTS = [0.2, 0.55, 0.25];

/** Pelo menos dois humanos precisam sobrar para a conversa fazer sentido. */
export function maxAiCount(playerCount: number): number {
  return Math.max(0, Math.min(2, playerCount - 2));
}

export function decideAiCount(playerCount: number, settings: RoomSettings, random: Random): number {
  const max = maxAiCount(playerCount);
  if (!settings.secretAiCount) return Math.min(1, max);

  const weights = AI_COUNT_WEIGHTS.slice(0, max + 1);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let count = 0; count < weights.length; count++) {
    roll -= weights[count];
    if (roll < 0) return count;
  }
  return max;
}

/**
 * Sorteia, em segredo, quem é Mestre e qual pseudônimo/avatar cada um usa.
 * A ordem dos lugares também é embaralhada, para a posição na lista não
 * entregar ninguém.
 */
export function drawSeats(playerIds: string[], settings: RoomSettings, random: Random): Seat[] {
  const aiCount = decideAiCount(playerIds.length, settings, random);
  const masters = new Set(shuffle(playerIds, random).slice(0, aiCount));
  // Embaralhar e usar por índice garante nomes, emojis e cores sem repetição.
  const pseudonyms = shuffle(PSEUDONYMS, random);
  const emojis = shuffle(AVATAR_EMOJIS, random);
  const colors = shuffle(AVATAR_COLORS, random);

  const seats = playerIds.map((playerId, index): Seat => ({
    id: randomUUID(),
    playerId,
    pseudonym: pseudonyms[index % pseudonyms.length],
    avatar: { emoji: emojis[index % emojis.length], color: colors[index % colors.length] },
    role: masters.has(playerId) ? 'master' : 'player',
    lastMessageAt: null,
    vote: null,
    persona: null,
    mirrorSamples: [],
    submitted: false,
    usingOwnKey: false,
    interventionsLeft: settings.masterInterventions ? GAME_RULES.masterInterventions : 0,
    reviewNext: false,
    aiReplies: 0,
    brokeCharacter: false,
  }));
  return shuffle(seats, random);
}
