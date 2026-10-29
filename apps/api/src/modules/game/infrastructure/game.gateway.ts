import { BeforeApplicationShutdown, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  AckResult,
  ClientToServerEvents,
  CreationPayload,
  GAME_NAMESPACE,
  ServerToClientEvents,
} from '@quem/shared';
import { Socket } from 'socket.io';
import { RoomTransaction } from '../../../infrastructure/database/room-transaction';
import { GameError } from '../../../shared/game-error';
import { AuthPlayer, PlayerTokenService } from '../../auth/player-token.service';
import { ROOM_CHANGED, RoomChangedEvent } from '../../rooms/application/rooms.service';
import { Player } from '../../rooms/domain/player';
import { ChatService } from '../application/chat.service';
import { MatchService } from '../application/match.service';
import { GameNamespace, playerChannel, roomChannel, SocketRealtime } from './socket-realtime';
import { SocketRateLimiter } from './socket-rate-limiter';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, { auth: AuthPlayer }>;

const TYPING_THROTTLE_MS = 1000;

/**
 * Porta de entrada WebSocket (namespace /game). Equivale a um controller:
 * autentica, converte a mensagem e chama o caso de uso. Nenhuma regra de
 * jogo mora aqui.
 *
 * Toda ação responde por "ack" ({ ok: true } ou { ok: false, error }), assim
 * o front-end mostra o erro certo para quem tentou a ação.
 */
@WebSocketGateway({ namespace: GAME_NAMESPACE, cors: { origin: true } })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, BeforeApplicationShutdown
{
  private readonly logger = new Logger(GameGateway.name);
  private readonly limiter = new SocketRateLimiter();
  private readonly lastTyping = new Map<string, number>();
  private shuttingDown = false;

  constructor(
    private readonly realtime: SocketRealtime,
    private readonly tokens: PlayerTokenService,
    private readonly tx: RoomTransaction,
    private readonly matches: MatchService,
    private readonly chat: ChatService,
  ) {}

  afterInit(server: GameNamespace): void {
    this.realtime.attach(server);
    // Middleware de autenticação: roda antes da conexão ser aceita.
    server.use((socket, next) => {
      this.authenticate(socket as GameSocket)
        .then(() => next())
        .catch((error: Error) => next(new Error(error.message)));
    });
  }

  private async authenticate(socket: GameSocket): Promise<void> {
    const auth = this.tokens.verify(socket.handshake.auth?.token as string | undefined);
    const player = await this.tx.read((em) => em.findOne(Player, { id: auth.playerId }));
    if (!player || player.roomId !== auth.roomId) {
      throw new GameError('UNAUTHORIZED', 'Jogador não encontrado nesta sala.');
    }
    socket.data.auth = auth;
  }

  async handleConnection(socket: GameSocket): Promise<void> {
    const { auth } = socket.data;
    await socket.join([roomChannel(auth.roomId), playerChannel(auth.playerId)]);
    this.realtime.markOnline(auth.roomId, auth.playerId);
    await this.matches.playerConnected(auth);
  }

  async handleDisconnect(socket: GameSocket): Promise<void> {
    const auth = socket.data.auth;
    this.limiter.forget(socket.id);
    this.lastTyping.delete(socket.id);
    if (!auth || this.shuttingDown) return;
    if (this.realtime.markOffline(auth.roomId, auth.playerId)) {
      await this.matches
        .refreshRoom(auth.roomId)
        .catch((error: Error) => this.logger.warn(`Falha ao atualizar sala: ${error.message}`));
    }
  }

  /** Ao desligar, os sockets caem todos de uma vez; não há por que avisar ninguém. */
  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  /** Avatar novo enviado pelo REST: atualiza a lista de jogadores. */
  @OnEvent(ROOM_CHANGED)
  async onRoomChanged(event: RoomChangedEvent): Promise<void> {
    await this.matches.refreshRoom(event.roomId);
  }

  @SubscribeMessage('room:settings')
  settings(@ConnectedSocket() socket: GameSocket, @MessageBody() body: unknown) {
    return this.respond(socket, () => this.matches.updateSettings(socket.data.auth, body));
  }

  @SubscribeMessage('player:chat-name')
  chatName(@ConnectedSocket() socket: GameSocket, @MessageBody() body: { name?: unknown }) {
    return this.respond(socket, () => this.matches.setChatName(socket.data.auth, body?.name));
  }

  @SubscribeMessage('match:start')
  start(@ConnectedSocket() socket: GameSocket) {
    return this.respond(socket, () => this.matches.startMatch(socket.data.auth));
  }

  @SubscribeMessage('creation:submit')
  submitCreation(@ConnectedSocket() socket: GameSocket, @MessageBody() body: CreationPayload) {
    return this.respond(socket, () => this.matches.submitCreation(socket.data.auth, body));
  }

  @SubscribeMessage('chat:send')
  send(@ConnectedSocket() socket: GameSocket, @MessageBody() body: { text: string }) {
    return this.respond(socket, () => this.chat.sendMessage(socket.data.auth, body?.text));
  }

  @SubscribeMessage('chat:typing')
  async typing(@ConnectedSocket() socket: GameSocket): Promise<void> {
    const now = Date.now();
    if (now - (this.lastTyping.get(socket.id) ?? 0) < TYPING_THROTTLE_MS) return;
    this.lastTyping.set(socket.id, now);
    await this.chat.typing(socket.data.auth).catch(() => undefined);
  }

  @SubscribeMessage('chat:report')
  report(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: { messageId: string; reason: string },
  ) {
    return this.respond(socket, () =>
      this.chat.report(socket.data.auth, body?.messageId, body?.reason),
    );
  }

  @SubscribeMessage('vote:cast')
  vote(@ConnectedSocket() socket: GameSocket, @MessageBody() body: { target: string }) {
    return this.respond(socket, () => this.matches.castVote(socket.data.auth, body?.target));
  }

  @SubscribeMessage('vote:lock')
  lock(@ConnectedSocket() socket: GameSocket) {
    return this.respond(socket, () => this.matches.lockVote(socket.data.auth));
  }

  @SubscribeMessage('master:intervene')
  intervene(@ConnectedSocket() socket: GameSocket, @MessageBody() body: { text: string }) {
    return this.respond(socket, () => this.chat.intervene(socket.data.auth, body?.text));
  }

  @SubscribeMessage('master:review-next')
  reviewNext(@ConnectedSocket() socket: GameSocket, @MessageBody() body: { enabled: boolean }) {
    return this.respond(socket, () => this.chat.setReviewNext(socket.data.auth, body?.enabled));
  }

  @SubscribeMessage('master:approve-draft')
  approveDraft(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: { draftId: string; text: string },
  ) {
    return this.respond(socket, () =>
      this.chat.approveDraft(socket.data.auth, body?.draftId, body?.text),
    );
  }

  /** Converte o resultado do caso de uso na resposta (ack) do Socket.IO. */
  private async respond(socket: GameSocket, task: () => Promise<void>): Promise<AckResult> {
    if (!this.limiter.allow(socket.id)) {
      return {
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Muitas ações seguidas. Calma!' },
      };
    }
    try {
      await task();
      return { ok: true, data: null };
    } catch (error) {
      if (error instanceof GameError) return { ok: false, error: error.toBody() };
      this.logger.error((error as Error).message, (error as Error).stack);
      return { ok: false, error: { code: 'INTERNAL', message: 'Algo deu errado. Tente de novo.' } };
    }
  }
}
