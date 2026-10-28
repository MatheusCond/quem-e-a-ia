import { ServerToClientEvents } from '@quem/shared';

export type ServerEvent = keyof ServerToClientEvents;
export type ServerEventArgs<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>;

/**
 * Porta de saída para o tempo real. Os casos de uso falam "mande isso para
 * a sala" sem saber que por baixo é Socket.IO. A implementação fica em
 * infrastructure/socket-realtime.ts.
 */
export abstract class Realtime {
  abstract toRoom<E extends ServerEvent>(
    roomId: string,
    event: E,
    ...args: ServerEventArgs<E>
  ): void;

  abstract toPlayer<E extends ServerEvent>(
    playerId: string,
    event: E,
    ...args: ServerEventArgs<E>
  ): void;

  /** Para a sala inteira, menos o próprio jogador (ex.: "digitando..."). */
  abstract toRoomExcept<E extends ServerEvent>(
    roomId: string,
    playerId: string,
    event: E,
    ...args: ServerEventArgs<E>
  ): void;

  abstract connectedPlayerIds(roomId: string): Set<string>;
}
