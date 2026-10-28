/**
 * Códigos de erro que a API devolve ao cliente. O texto em português vai
 * junto na resposta; o código serve para o front-end reagir sem comparar
 * strings.
 */
export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'MATCH_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_ALLOWED'
  | 'INVALID_PHASE'
  | 'NOT_ENOUGH_PLAYERS'
  | 'DAILY_MATCH_LIMIT'
  | 'MESSAGE_TOO_LONG'
  | 'MESSAGE_EMPTY'
  | 'TOO_FAST'
  | 'BLOCKED_CONTENT'
  | 'VOTE_LOCKED'
  | 'NO_INTERVENTIONS_LEFT'
  | 'DRAFT_EXPIRED'
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
}
