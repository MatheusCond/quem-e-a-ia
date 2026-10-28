import { MatchPhase, RoomSettings } from '@quem/shared';
import { GameError } from '../../../shared/game-error';

/**
 * Máquina de estados da partida:
 *
 *   lobby → creation → conversation → voting → reveal
 *
 * Só existe um caminho, sempre para a frente. Quem decide *quando* avançar é
 * o servidor (timer ou "todo mundo terminou"); aqui fica só *se* pode.
 */
const NEXT: Record<MatchPhase, MatchPhase | null> = {
  lobby: 'creation',
  creation: 'conversation',
  conversation: 'voting',
  voting: 'reveal',
  reveal: null,
};

export function nextPhase(current: MatchPhase): MatchPhase {
  const next = NEXT[current];
  if (!next) {
    throw new GameError('INVALID_PHASE', 'A partida já terminou.');
  }
  return next;
}

export function canTransition(from: MatchPhase, to: MatchPhase): boolean {
  return NEXT[from] === to;
}

export function assertTransition(from: MatchPhase, to: MatchPhase): void {
  if (!canTransition(from, to)) {
    throw new GameError('INVALID_PHASE', `Transição inválida: ${from} → ${to}.`);
  }
}

/** Duração planejada de cada fase, em milissegundos. null = sem prazo. */
export function phaseDurationMs(phase: MatchPhase, settings: RoomSettings): number | null {
  switch (phase) {
    case 'creation':
      return settings.creationSeconds * 1000;
    case 'conversation':
      return settings.conversationSeconds * 1000;
    case 'voting':
      return settings.votingSeconds * 1000;
    default:
      return null;
  }
}
