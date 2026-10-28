/**
 * Fases de uma partida, na ordem em que acontecem.
 * A máquina de estados que decide as transições fica no domínio da API
 * (apps/api/src/modules/game/domain/match-state-machine.ts).
 */
export const MATCH_PHASES = ['lobby', 'creation', 'conversation', 'voting', 'reveal'] as const;

export type MatchPhase = (typeof MATCH_PHASES)[number];

export const PHASE_LABELS: Record<MatchPhase, string> = {
  lobby: 'Sala de espera',
  creation: 'Criação da IA',
  conversation: 'Conversa',
  voting: 'Votação',
  reveal: 'Revelação',
};
