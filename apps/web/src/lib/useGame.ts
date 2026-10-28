import {
  type AckResult,
  type ChatMessageView,
  type ClientToServerEvents,
  GAME_NAMESPACE,
  type MasterDraft,
  type MatchNotice,
  type RoomStateView,
  type ServerToClientEvents,
} from '@quem/shared';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Argumentos de um evento, sem o callback de ack (que o hook preenche). */
type EventArgs<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [...infer A, unknown] ? A : never;

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'rejected';

export interface GameState {
  status: ConnectionStatus;
  rejection: string | null;
  room: RoomStateView | null;
  messages: ChatMessageView[];
  /** seatId → até quando mostrar "digitando...". */
  typing: Record<string, number>;
  notice: MatchNotice | null;
  draft: MasterDraft | null;
  /** Diferença entre o relógio do servidor e o do aparelho, em ms. */
  clockOffset: number;
}

type Action =
  | { type: 'status'; status: ConnectionStatus; rejection?: string }
  | { type: 'state'; room: RoomStateView; receivedAt: number }
  | { type: 'history'; messages: ChatMessageView[] }
  | { type: 'message'; message: ChatMessageView }
  | { type: 'typing'; seatId: string; until: number }
  | { type: 'typing-end'; seatId: string; until: number }
  | { type: 'notice'; notice: MatchNotice | null }
  | { type: 'draft'; draft: MasterDraft | null };

const initialState: GameState = {
  status: 'connecting',
  rejection: null,
  room: null,
  messages: [],
  typing: {},
  notice: null,
  draft: null,
  clockOffset: 0,
};

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status, rejection: action.rejection ?? null };
    case 'state': {
      const matchChanged = state.room?.match?.id !== action.room.match?.id;
      return {
        ...state,
        room: action.room,
        clockOffset: new Date(action.room.serverTime).getTime() - action.receivedAt,
        draft: matchChanged ? null : state.draft,
      };
    }
    case 'history':
      return { ...state, messages: action.messages, typing: {} };
    case 'message': {
      if (state.messages.some((m) => m.id === action.message.id)) return state;
      const typing = { ...state.typing };
      if (action.message.seatId) delete typing[action.message.seatId];
      return { ...state, messages: [...state.messages, action.message], typing };
    }
    case 'typing':
      return { ...state, typing: { ...state.typing, [action.seatId]: action.until } };
    case 'typing-end': {
      if (state.typing[action.seatId] !== action.until) return state;
      const typing = { ...state.typing };
      delete typing[action.seatId];
      return { ...state, typing };
    }
    case 'notice':
      return { ...state, notice: action.notice };
    case 'draft':
      return { ...state, draft: action.draft };
  }
}

/**
 * Conecta no WebSocket do jogo e mantém o estado da sala.
 *
 * O servidor é a autoridade: este hook só guarda a última view recebida.
 * Se a conexão cair, o Socket.IO reconecta sozinho e o servidor manda o
 * estado completo e o histórico de novo, então nada se perde.
 */
export function useGame(token: string | null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket: GameSocket = io(GAME_NAMESPACE, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => dispatch({ type: 'status', status: 'online' }));
    socket.on('disconnect', () => dispatch({ type: 'status', status: 'reconnecting' }));
    socket.on('connect_error', (error) => {
      // Erro de autenticação não melhora tentando de novo: o token não vale mais.
      const rejected = /sess|jogador|token/i.test(error.message);
      if (rejected) socket.close();
      dispatch({
        type: 'status',
        status: rejected ? 'rejected' : 'reconnecting',
        rejection: rejected ? error.message : undefined,
      });
    });
    socket.on('room:state', (room) => dispatch({ type: 'state', room, receivedAt: Date.now() }));
    socket.on('chat:history', (messages) => dispatch({ type: 'history', messages }));
    socket.on('chat:message', (message) => dispatch({ type: 'message', message }));
    socket.on('chat:typing', ({ seatId, durationMs }) => {
      const until = Date.now() + durationMs;
      dispatch({ type: 'typing', seatId, until });
      setTimeout(() => dispatch({ type: 'typing-end', seatId, until }), durationMs);
    });
    socket.on('match:notice', (notice) => {
      dispatch({ type: 'notice', notice });
      setTimeout(() => dispatch({ type: 'notice', notice: null }), 6000);
    });
    socket.on('master:draft', (draft) => dispatch({ type: 'draft', draft }));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [token]);

  /** Emite um evento e espera a resposta do servidor (ack). */
  const send = useCallback(
    async <E extends keyof ClientToServerEvents>(
      event: E,
      ...args: EventArgs<E>
    ): Promise<AckResult> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return {
          ok: false,
          error: { code: 'INTERNAL', message: 'Sem conexão. Tentando reconectar...' },
        };
      }
      try {
        const timed = socket.timeout(8000) as unknown as {
          emitWithAck: (...a: unknown[]) => Promise<AckResult>;
        };
        return await timed.emitWithAck(event, ...args);
      } catch {
        return {
          ok: false,
          error: { code: 'INTERNAL', message: 'O servidor não respondeu a tempo.' },
        };
      }
    },
    [],
  );

  /** "digitando..." não precisa de resposta. */
  const notifyTyping = useCallback(() => {
    socketRef.current?.emit('chat:typing');
  }, []);

  const clearDraft = useCallback(() => dispatch({ type: 'draft', draft: null }), []);

  return { ...state, send, notifyTyping, clearDraft };
}

export type Game = ReturnType<typeof useGame>;
