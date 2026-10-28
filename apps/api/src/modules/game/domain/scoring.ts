import { NO_AI_VOTE, RoomSettings } from '@quem/shared';
import { Seat } from './seat';

export const SCORE = {
  correctVote: 100,
  /** Bônus máximo por travar o voto no primeiro segundo da conversa. */
  earlyLockMaxBonus: 50,
  wrongAccusation: -50,
  perDeceivedPlayer: 50,
  brokeCharacter: -100,
} as const;

export interface ScoreLine {
  playerId: string;
  delta: number;
  reasons: string[];
}

export interface ScoringResult {
  lines: ScoreLine[];
  correctVoters: number;
  totalVoters: number;
  /** playerId do Mestre → quantos jogadores a IA dele enganou. */
  deceivedByMaster: Record<string, number>;
}

export interface ScoringInput {
  seats: Seat[];
  settings: RoomSettings;
  conversationStartedAt: Date | null;
}

export function isCorrectVote(target: string, aiSeatIds: string[]): boolean {
  return aiSeatIds.length === 0 ? target === NO_AI_VOTE : aiSeatIds.includes(target);
}

/**
 * Calcula a pontuação de uma partida. Função pura: mesma entrada, mesma
 * saída, sem banco e sem relógio. Por isso dá para testar cada regra isolada.
 *
 * - Acertar a IA: +100 (+ até 50 se travou o voto cedo).
 * - Acusar um humano: -50. Dizer "não tem IA" quando tinha: 0.
 * - Mestre: +50 por jogador que votou e não achou a IA dele;
 *   -100 se a IA saiu do personagem (quando a regra está ligada).
 */
export function computeScores(input: ScoringInput): ScoringResult {
  const { seats, settings } = input;
  const aiSeatIds = seats.filter((s) => s.role === 'master').map((s) => s.id);
  const voters = seats.filter((s) => s.role === 'player' && s.vote !== null);
  const lines: ScoreLine[] = [];
  let correctVoters = 0;

  for (const seat of seats.filter((s) => s.role === 'player')) {
    const line: ScoreLine = { playerId: seat.playerId, delta: 0, reasons: [] };
    lines.push(line);

    if (!seat.vote) {
      line.reasons.push('Não votou');
      continue;
    }

    const target = seat.vote.target;
    if (isCorrectVote(target, aiSeatIds)) {
      correctVoters++;
      line.delta += SCORE.correctVote;
      line.reasons.push(
        aiSeatIds.length === 0
          ? `Acertou que não tinha IA (+${SCORE.correctVote})`
          : `Encontrou a IA (+${SCORE.correctVote})`,
      );
      const bonus = earlyLockBonus(seat, input);
      if (bonus > 0) {
        line.delta += bonus;
        line.reasons.push(`Travou o voto cedo (+${bonus})`);
      }
    } else if (target === NO_AI_VOTE) {
      line.reasons.push('Achou que não tinha IA, mas tinha (0)');
    } else {
      line.delta += SCORE.wrongAccusation;
      line.reasons.push(`Acusou um humano (${SCORE.wrongAccusation})`);
    }
  }

  const deceivedByMaster: Record<string, number> = {};
  for (const master of seats.filter((s) => s.role === 'master')) {
    const line: ScoreLine = { playerId: master.playerId, delta: 0, reasons: [] };
    lines.push(line);

    const deceived = voters.filter((v) => v.vote!.target !== master.id).length;
    deceivedByMaster[master.playerId] = deceived;
    line.delta += deceived * SCORE.perDeceivedPlayer;
    line.reasons.push(
      deceived === 1
        ? `Enganou 1 jogador (+${SCORE.perDeceivedPlayer})`
        : `Enganou ${deceived} jogadores (+${deceived * SCORE.perDeceivedPlayer})`,
    );

    if (settings.injectionPenalty && master.brokeCharacter) {
      line.delta += SCORE.brokeCharacter;
      line.reasons.push(`A IA saiu do personagem (${SCORE.brokeCharacter})`);
    }
  }

  return { lines, correctVoters, totalVoters: voters.length, deceivedByMaster };
}

/**
 * Bônus proporcional ao tempo de conversa que ainda faltava quando o voto
 * foi travado. Travar na votação (depois da conversa) não dá bônus.
 */
function earlyLockBonus(seat: Seat, input: ScoringInput): number {
  const { settings, conversationStartedAt } = input;
  if (!settings.voteLock || !seat.vote?.locked || !seat.vote.lockedAt || !conversationStartedAt) {
    return 0;
  }
  const duration = settings.conversationSeconds * 1000;
  const elapsed = new Date(seat.vote.lockedAt).getTime() - conversationStartedAt.getTime();
  const remaining = Math.min(1, Math.max(0, 1 - elapsed / duration));
  return Math.round(SCORE.earlyLockMaxBonus * remaining);
}
