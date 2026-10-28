import { findBlockedTerm, GAME_RULES, RoomSettings } from '@quem/shared';
import { GameError } from '../../../shared/game-error';
import { Random, randomInt } from '../../../shared/random';

export function maxMessageChars(settings: RoomSettings): number {
  return settings.messageLimits ? GAME_RULES.maxMessageChars : GAME_RULES.hardMaxMessageChars;
}

/** Limpa espaços e aplica tamanho e moderação. Devolve o texto final. */
export function validateChatText(raw: string, settings: RoomSettings): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    throw new GameError('MESSAGE_EMPTY', 'Mensagem vazia.');
  }
  const max = maxMessageChars(settings);
  if (text.length > max) {
    throw new GameError('MESSAGE_TOO_LONG', `Mensagens podem ter até ${max} caracteres.`);
  }
  if (findBlockedTerm(text)) {
    throw new GameError('BLOCKED_CONTENT', 'Essa mensagem tem conteúdo ofensivo e foi bloqueada.');
  }
  return text;
}

export function assertCooldown(lastMessageAt: string | null, now: Date, settings: RoomSettings) {
  if (!settings.messageLimits || !lastMessageAt) return;
  const elapsed = now.getTime() - new Date(lastMessageAt).getTime();
  if (elapsed < GAME_RULES.minMessageIntervalMs) {
    throw new GameError('TOO_FAST', 'Calma! Espere um pouquinho antes de mandar outra mensagem.');
  }
}

/**
 * Atraso aleatório antes de uma mensagem humana aparecer. Assim, quem
 * responde instantaneamente não se destaca da IA, que sempre "digita".
 */
export function humanDelayMs(settings: RoomSettings, random: Random): number {
  return settings.typingAndDelay ? randomInt(400, 2200, random) : 0;
}

/** Quanto tempo a IA (ou o Mestre intervindo) fica "digitando...". */
export function typingDurationMs(text: string, settings: RoomSettings, random: Random): number {
  if (!settings.typingAndDelay) return 0;
  const perChar = randomInt(45, 75, random);
  const reaction = randomInt(800, 2000, random);
  return Math.min(9000, Math.max(1500, reaction + text.length * perChar));
}

/** Corta o texto da IA no limite, sem quebrar palavra no meio. */
export function truncateForChat(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}
