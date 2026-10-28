import { AiSeatContext, AiTurnRequestedEvent } from '@quem/shared';

export type Random = () => number;

/** Chance de responder em cada situação, com "IA não responde tudo" ligado. */
export const REPLY_CHANCE = {
  mentioned: 0.9,
  theme: 0.6,
  question: 0.55,
  normal: 0.35,
  fromAnotherAi: 0.25,
} as const;

export interface ReplyDecision {
  reply: boolean;
  reason: string;
}

export interface ReplyLimits {
  maxRepliesPerMatch: number;
  minReplyGapMs: number;
}

/**
 * Decide se uma IA responde a uma mensagem. Função pura: recebe o evento, o
 * lugar da IA, o relógio e o sorteio; não chama ninguém.
 *
 * Responder toda mensagem denunciaria a IA na hora. Com "IA não responde
 * tudo" ligado, ela responde mais quando é citada ou perguntada e às vezes
 * fica quieta. A pergunta-relâmpago é sempre respondida: todo mundo responde.
 */
export function decideReply(
  event: AiTurnRequestedEvent,
  seat: AiSeatContext,
  limits: ReplyLimits,
  now: Date,
  random: Random,
): ReplyDecision {
  const { trigger } = event;
  if (trigger.seatId === seat.seatId) return { reply: false, reason: 'mensagem da própria IA' };
  if (seat.repliesSoFar >= limits.maxRepliesPerMatch) {
    return { reply: false, reason: 'limite de respostas da partida' };
  }
  if (trigger.kind === 'flash') return { reply: true, reason: 'pergunta-relâmpago' };

  if (seat.lastMessageAt) {
    const elapsed = now.getTime() - new Date(seat.lastMessageAt).getTime();
    if (elapsed < limits.minReplyGapMs) return { reply: false, reason: 'falou agora há pouco' };
  }
  if (!event.settings.selectiveReplies) return { reply: true, reason: 'responde tudo' };

  const chance = replyChance(event, seat);
  return random() < chance
    ? { reply: true, reason: `sorteio (${chance})` }
    : { reply: false, reason: `ficou quieta (${chance})` };
}

function replyChance(event: AiTurnRequestedEvent, seat: AiSeatContext): number {
  const { trigger } = event;
  if (isMentioned(trigger.text, seat.pseudonym)) return REPLY_CHANCE.mentioned;
  if (trigger.kind === 'theme') return REPLY_CHANCE.theme;
  if (event.aiSeats.some((s) => s.seatId === trigger.seatId)) return REPLY_CHANCE.fromAnotherAi;
  if (trigger.text.includes('?')) return REPLY_CHANCE.question;
  return REPLY_CHANCE.normal;
}

/** "Capivara Zen" é citada por "capivara", "zen" ou o nome inteiro, sem acento. */
export function isMentioned(text: string, pseudonym: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const words = ` ${normalize(text).replace(/[^a-z0-9]+/g, ' ')} `;
  return normalize(pseudonym)
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3 && !['de', 'da', 'do'].includes(part))
    .some((part) => words.includes(` ${part} `));
}
