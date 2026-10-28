import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { TurnTriggerKind } from '@quem/shared';
import { RoomTransaction } from '../../../infrastructure/database/room-transaction';
import { Scheduler } from '../../../infrastructure/scheduler';
import { ChatMessage } from '../domain/chat-message';
import { GameMatch } from '../domain/game-match';
import { AiTurnPublisher } from './ai-turn-publisher';
import { Realtime } from './realtime';
import { toMessageView } from './room-presenter';

/**
 * Caminho comum de toda mensagem do chat, seja humana, da IA ou do sistema:
 *
 * 1. grava no banco (visibleAt pode estar no futuro, por causa do atraso);
 * 2. quando chega a hora, envia para a sala pelo WebSocket;
 * 3. avisa o worker pelo SNS, para a IA decidir se responde.
 */
@Injectable()
export class MessageDelivery {
  constructor(
    private readonly tx: RoomTransaction,
    private readonly scheduler: Scheduler,
    private readonly realtime: Realtime,
    private readonly turns: AiTurnPublisher,
  ) {}

  /** Chamado dentro de uma transação da sala; a entrega acontece depois do commit. */
  post(
    em: EntityManager,
    match: GameMatch,
    message: ChatMessage,
    aiTrigger: TurnTriggerKind | null,
  ): void {
    em.persist(message);
    this.scheduler.at(`message:${message.id}`, message.visibleAt, () =>
      this.deliver(match.roomId, message.id, aiTrigger),
    );
  }

  private deliver(roomId: string, messageId: string, aiTrigger: TurnTriggerKind | null) {
    // Passa pela fila da sala: só roda depois que a transação que criou a mensagem terminou.
    return this.tx.run(roomId, async (em) => {
      const message = await em.findOne(ChatMessage, { id: messageId });
      if (!message) return;
      this.realtime.toRoom(roomId, 'chat:message', toMessageView(message, false));

      const match = await em.findOne(GameMatch, { id: message.matchId });
      if (match && aiTrigger) await this.turns.publish(em, match, message, aiTrigger);
    });
  }
}
