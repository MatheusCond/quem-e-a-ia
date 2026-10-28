import { ApiErrorBody } from './errors';
import { RoomSettings } from './room-settings';
import { ChatMessageView, MasterDraft, MatchNotice, RoomStateView, VoteTarget } from './views';

/**
 * Contrato do WebSocket (Socket.IO, namespace "/game").
 * Tipar os dois lados com as mesmas interfaces faz o compilador avisar
 * quando a API e o front-end divergem.
 */

export type AckResult<T = null> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };
export type Ack<T = null> = (result: AckResult<T>) => void;

export interface CreationPayload {
  persona: string;
  mirrorSamples?: string[];
  /** "Usar minha própria chave": fica só em memória durante a partida. */
  ownApiKey?: string;
}

export interface ClientToServerEvents {
  'room:settings': (settings: Partial<RoomSettings>, ack: Ack) => void;
  'match:start': (ack: Ack) => void;
  'creation:submit': (payload: CreationPayload, ack: Ack) => void;
  'chat:send': (payload: { text: string }, ack: Ack) => void;
  'chat:typing': () => void;
  'chat:report': (payload: { messageId: string; reason: string }, ack: Ack) => void;
  'vote:cast': (payload: { target: VoteTarget }, ack: Ack) => void;
  'vote:lock': (ack: Ack) => void;
  'master:intervene': (payload: { text: string }, ack: Ack) => void;
  'master:review-next': (payload: { enabled: boolean }, ack: Ack) => void;
  'master:approve-draft': (payload: { draftId: string; text: string }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomStateView) => void;
  'chat:history': (messages: ChatMessageView[]) => void;
  'chat:message': (message: ChatMessageView) => void;
  'chat:typing': (payload: { seatId: string; durationMs: number }) => void;
  'match:notice': (notice: MatchNotice) => void;
  'master:draft': (draft: MasterDraft) => void;
}

export const GAME_NAMESPACE = '/game';
