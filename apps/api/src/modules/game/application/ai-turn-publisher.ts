import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessageBus } from '@quem/cloud';
import { AiTurnRequestedEvent, TOPICS, TurnTriggerKind } from '@quem/shared';
import { APP_CONFIG, AppConfig } from '../../../config/app-config';
import { MESSAGE_BUS } from '../../../infrastructure/infrastructure.module';
import { ChatMessage } from '../domain/chat-message';
import { maxMessageChars } from '../domain/chat-rules';
import { DEFAULT_PERSONA } from '../domain/content';
import { GameMatch } from '../domain/game-match';
import { OwnKeyVault } from './own-key-vault';

/**
 * Publica no SNS o evento "chegou mensagem nova" com tudo que o worker
 * precisa para decidir e responder. O worker não lê o banco da API: o
 * evento é autossuficiente, então ele pode escalar sem estado.
 */
@Injectable()
export class AiTurnPublisher {
  private readonly logger = new Logger(AiTurnPublisher.name);

  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly vault: OwnKeyVault,
  ) {}

  async publish(
    em: EntityManager,
    match: GameMatch,
    trigger: ChatMessage,
    kind: TurnTriggerKind,
  ): Promise<void> {
    if (match.aiCount === 0 || match.aiResting || match.phase !== 'conversation') return;

    const recent = await em.find(
      ChatMessage,
      { matchId: match.id, visibleAt: { $lte: trigger.visibleAt } },
      { orderBy: { visibleAt: 'desc' }, limit: this.config.limits.contextMessages },
    );
    const pseudonymOf = (seatId: string | null) =>
      seatId ? (match.seatById(seatId)?.pseudonym ?? null) : null;

    const event: AiTurnRequestedEvent = {
      type: 'ai.turn.requested',
      matchId: match.id,
      trigger: { kind, messageId: trigger.id, seatId: trigger.seatId, text: trigger.text },
      aiSeats: match.masterSeats().map((seat) => ({
        seatId: seat.id,
        pseudonym: seat.pseudonym,
        persona: seat.persona ?? DEFAULT_PERSONA,
        mirrorSamples: seat.mirrorSamples,
        repliesSoFar: seat.aiReplies,
        lastMessageAt: seat.lastMessageAt,
        encryptedApiKey: this.vault.encryptedFor(match.id, seat.id),
      })),
      pseudonyms: match.seats.map((s) => s.pseudonym),
      recentMessages: recent.reverse().map((m) => ({
        seatId: m.seatId,
        pseudonym: pseudonymOf(m.seatId),
        text: m.text,
      })),
      theme: match.theme,
      settings: {
        selectiveReplies: match.settings.selectiveReplies,
        maxChars: maxMessageChars(match.settings),
      },
      occurredAt: new Date().toISOString(),
    };

    try {
      await this.bus.publish(TOPICS.chatEvents, event);
    } catch (error) {
      // Se a fila estiver fora, o chat continua; a IA só perde essa mensagem.
      this.logger.error(`Falha ao publicar turno da IA: ${(error as Error).message}`);
    }
  }
}
