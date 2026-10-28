import { MatchPhase } from './phases';
import { RoomSettings } from './room-settings';

/**
 * Formatos que o servidor envia ao navegador. Eles são "views": a API monta
 * uma por jogador, escondendo o que aquele jogador não pode saber (quem é o
 * Mestre, qual pseudônimo é de quem, em quem os outros votaram).
 */

export interface SeatAvatar {
  emoji: string;
  /** Cor de fundo em hexadecimal. */
  color: string;
}

export interface PlayerView {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  connected: boolean;
  totalScore: number;
  isHost: boolean;
}

/** Um lugar no chat: pseudônimo e avatar sorteados, sem revelar o dono. */
export interface SeatView {
  seatId: string;
  pseudonym: string;
  avatar: SeatAvatar;
}

/** Id de um lugar do chat ou "none" para "não tem IA nenhuma". */
export type VoteTarget = string;
export const NO_AI_VOTE = 'none';

export interface MyVoteView {
  target: VoteTarget;
  locked: boolean;
}

export interface MasterView {
  aiSeatId: string;
  submitted: boolean;
  persona: string | null;
  mirrorSamples: string[];
  interventionsLeft: number;
  reviewNext: boolean;
  usingOwnKey: boolean;
}

export interface FlashQuestionView {
  question: string;
  endsAt: string;
}

export interface MatchView {
  id: string;
  number: number;
  phase: MatchPhase;
  phaseEndsAt: string | null;
  /** "spectator": entrou na sala com a partida em andamento; joga a próxima. */
  role: 'player' | 'master' | 'spectator';
  /** Lugar do próprio jogador no chat. Para o Mestre é null: o lugar dele é da IA. */
  mySeatId: string | null;
  /** Vazio durante a criação, para ninguém deduzir nada pelos pseudônimos. */
  seats: SeatView[];
  theme: string | null;
  flash: FlashQuestionView | null;
  /** eligible é null quando o número de IAs é secreto (contar eleitores entregaria a resposta). */
  votes: { voted: number; eligible: number | null; mine: MyVoteView | null };
  canVote: boolean;
  /** Preenchido só para o Mestre. */
  master: MasterView | null;
  /** O disjuntor de orçamento desligou a IA nesta partida. */
  aiResting: boolean;
  reveal: RevealView | null;
}

export interface RoomStateView {
  code: string;
  hostPlayerId: string;
  settings: RoomSettings;
  players: PlayerView[];
  me: { playerId: string; nickname: string };
  match: MatchView | null;
  serverTime: string;
}

export type MessageKind = 'chat' | 'system' | 'flash';

export interface ChatMessageView {
  id: string;
  seatId: string | null;
  kind: MessageKind;
  text: string;
  sentAt: string;
  /** Só aparece na revelação. */
  reveal?: { isAi: boolean; isIntervention: boolean; brokeCharacter: boolean };
}

export interface RevealSeatView extends SeatView {
  playerId: string;
  nickname: string;
  role: 'player' | 'master';
}

export interface RevealView {
  aiSeatIds: string[];
  seats: RevealSeatView[];
  masters: Array<{
    playerId: string;
    nickname: string;
    aiSeatId: string;
    persona: string;
    mirrorSamples: string[];
    brokeCharacter: boolean;
    deceived: number;
  }>;
  votes: Array<{
    playerId: string;
    nickname: string;
    target: VoteTarget | null;
    locked: boolean;
    correct: boolean;
  }>;
  scores: Array<{ playerId: string; nickname: string; delta: number; reasons: string[] }>;
}

export type NoticeKind = 'ai-resting' | 'flash' | 'info';

export interface MatchNotice {
  kind: NoticeKind;
  text: string;
}

export interface MasterDraft {
  draftId: string;
  text: string;
  expiresAt: string;
}
