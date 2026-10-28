import { Injectable } from '@nestjs/common';
import { ClientToServerEvents, ServerToClientEvents } from '@quem/shared';
import { Namespace } from 'socket.io';
import { Realtime, ServerEvent, ServerEventArgs } from '../application/realtime';

export type GameNamespace = Namespace<ClientToServerEvents, ServerToClientEvents>;

export const roomChannel = (roomId: string) => `room:${roomId}`;
export const playerChannel = (playerId: string) => `player:${playerId}`;

/**
 * Implementação Socket.IO da porta Realtime, mais o controle de presença
 * (quem está online). Cada jogador entra em dois "canais": o da sala e um
 * só dele, que recebe a view personalizada.
 *
 * A presença fica em memória: com várias instâncias da API seria preciso
 * guardar no Redis e usar o adapter Redis do Socket.IO (ver DECISOES.md).
 */
@Injectable()
export class SocketRealtime extends Realtime {
  private server: GameNamespace | null = null;
  private readonly socketsPerPlayer = new Map<string, number>();
  private readonly onlineByRoom = new Map<string, Set<string>>();

  attach(server: GameNamespace): void {
    this.server = server;
  }

  /** Registra mais uma conexão do jogador (ele pode ter várias abas). */
  markOnline(roomId: string, playerId: string): void {
    this.socketsPerPlayer.set(playerId, (this.socketsPerPlayer.get(playerId) ?? 0) + 1);
    const online = this.onlineByRoom.get(roomId) ?? new Set<string>();
    online.add(playerId);
    this.onlineByRoom.set(roomId, online);
  }

  /** Devolve true se essa era a última conexão do jogador. */
  markOffline(roomId: string, playerId: string): boolean {
    const remaining = (this.socketsPerPlayer.get(playerId) ?? 1) - 1;
    if (remaining > 0) {
      this.socketsPerPlayer.set(playerId, remaining);
      return false;
    }
    this.socketsPerPlayer.delete(playerId);
    this.onlineByRoom.get(roomId)?.delete(playerId);
    if (this.onlineByRoom.get(roomId)?.size === 0) this.onlineByRoom.delete(roomId);
    return true;
  }

  connectedPlayerIds(roomId: string): Set<string> {
    return new Set(this.onlineByRoom.get(roomId) ?? []);
  }

  toRoom<E extends ServerEvent>(roomId: string, event: E, ...args: ServerEventArgs<E>): void {
    this.server?.to(roomChannel(roomId)).emit(event, ...args);
  }

  toPlayer<E extends ServerEvent>(playerId: string, event: E, ...args: ServerEventArgs<E>): void {
    this.server?.to(playerChannel(playerId)).emit(event, ...args);
  }

  toRoomExcept<E extends ServerEvent>(
    roomId: string,
    playerId: string,
    event: E,
    ...args: ServerEventArgs<E>
  ): void {
    this.server
      ?.to(roomChannel(roomId))
      .except(playerChannel(playerId))
      .emit(event, ...args);
  }
}
