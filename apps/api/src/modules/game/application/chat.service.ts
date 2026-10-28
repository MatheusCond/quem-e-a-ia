import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiReplyEvent, findBlockedTerm } from '@quem/shared';
import { RoomTransaction } from '../../../infrastructure/database/room-transaction';
import { Scheduler } from '../../../infrastructure/scheduler';
import { GameError } from '../../../shared/game-error';
import { Random, RANDOM } from '../../../shared/random';
import { AuthPlayer } from '../../auth/player-token.service';
import { Report } from '../../moderation/domain/report';
import { ChatMessage } from '../domain/chat-message';
import {
  humanDelayMs,
  maxMessageChars,
  truncateForChat,
  typingDurationMs,
  validateChatText,
} from '../domain/chat-rules';
import { GameMatch } from '../domain/game-match';
import { Seat } from '../domain/seat';
import { DraftStore } from './draft-store';
import { requireCurrentMatch } from './match-queries';
import { MessageDelivery } from './message-delivery';
import { Realtime } from './realtime';
import { RoomPresenter } from './room-presenter';

const HUMAN_TYPING_MS = 3000;

/**
 * Casos de uso do chat: mensagens humanas, respostas da IA vindas do worker,
 * intervenções do Mestre, "digitando..." e denúncias.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly tx: RoomTransaction,
    private readonly delivery: MessageDelivery,
    private readonly realtime: Realtime,
    private readonly presenter: RoomPresenter,
    private readonly scheduler: Scheduler,
    private readonly drafts: DraftStore,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  async sendMessage(auth: AuthPlayer, text: string): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const match = await requireCurrentMatch(em, auth.roomId);
      const now = new Date();
      const { seat, text: clean } = match.registerHumanMessage(auth.playerId, text, now);
      const message = ChatMessage.create({
        matchId: match.id,
        seatId: seat.id,
        kind: 'chat',
        text: clean,
        now,
        delayMs: humanDelayMs(match.settings, this.random),
      });
      this.delivery.post(em, match, message, 'message');
    });
  }

  /** Repassa o "digitando..." de um humano, identificado só pelo pseudônimo. */
  async typing(auth: AuthPlayer): Promise<void> {
    const match = await this.tx.read((em) => requireCurrentMatch(em, auth.roomId));
    const seat = match.seatOfPlayer(auth.playerId);
    if (match.phase !== 'conversation' || seat?.role !== 'player') return;
    this.realtime.toRoomExcept(auth.roomId, auth.playerId, 'chat:typing', {
      seatId: seat.id,
      durationMs: HUMAN_TYPING_MS,
    });
  }

  async report(auth: AuthPlayer, messageId: string, reason: string): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const message = await em.findOne(ChatMessage, { id: String(messageId) });
      const match = message && (await em.findOne(GameMatch, { id: message.matchId }));
      if (!message || match?.roomId !== auth.roomId) {
        throw new GameError('VALIDATION', 'Mensagem não encontrada.');
      }
      em.persist(
        Report.create({
          matchId: match.id,
          messageId: message.id,
          reporterPlayerId: auth.playerId,
          reason,
        }),
      );
      this.logger.warn(`Denúncia na partida ${match.id}, mensagem ${message.id}`);
    });
  }

  // ------------------------------------------------------------ IA

  /** Resposta gerada pelo worker, chegando pela fila ai-replies-api. */
  async handleAiReply(event: AiReplyEvent): Promise<void> {
    const roomId = await this.tx.read(
      async (em) => (await em.findOne(GameMatch, { id: event.matchId }))?.roomId,
    );
    if (!roomId) return;

    await this.tx.run(roomId, async (em) => {
      const match = await em.findOne(GameMatch, { id: event.matchId });
      const seat = match?.seatById(event.seatId);
      if (!match || match.phase !== 'conversation' || match.aiResting || seat?.role !== 'master') {
        return;
      }

      const text = truncateForChat(event.text, maxMessageChars(match.settings));
      if (!text || findBlockedTerm(text)) {
        this.logger.warn(`Resposta da IA descartada pela moderação (partida ${match.id})`);
        return;
      }
      if (this.drafts.hasPendingFor(seat.id)) return;

      if (seat.reviewNext && seat.interventionsLeft > 0) {
        this.sendDraftToMaster(match, seat, text, event.brokeCharacter);
        return;
      }
      this.postAiMessage(em, match, seat, text, {
        brokeCharacter: event.brokeCharacter,
        isIntervention: false,
      });
    });
  }

  // ------------------------------------------------------------ Mestre

  /** O Mestre escreve uma mensagem no lugar da IA. */
  async intervene(auth: AuthPlayer, text: string): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const match = await requireCurrentMatch(em, auth.roomId);
      const clean = validateChatText(text, match.settings);
      const seat = match.useIntervention(auth.playerId);
      this.postAiMessage(em, match, seat, clean, { brokeCharacter: false, isIntervention: true });
      await em.flush();
      await this.presenter.broadcast(em, auth.roomId);
    });
  }

  async setReviewNext(auth: AuthPlayer, enabled: boolean): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const match = await requireCurrentMatch(em, auth.roomId);
      match.setReviewNext(auth.playerId, Boolean(enabled));
      await em.flush();
      await this.presenter.broadcast(em, auth.roomId);
    });
  }

  /**
   * O Mestre revisou a resposta da IA. Se mudou o texto, gasta uma
   * intervenção; se aprovou como estava, não gasta.
   */
  async approveDraft(auth: AuthPlayer, draftId: string, text: string): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const draft = this.drafts.take(String(draftId));
      if (!draft || draft.masterPlayerId !== auth.playerId) {
        throw new GameError('DRAFT_EXPIRED', 'Essa resposta já foi enviada.');
      }
      this.scheduler.cancel(`draft:${draft.id}`);

      const match = await requireCurrentMatch(em, auth.roomId);
      if (match.id !== draft.matchId || match.phase !== 'conversation') return;

      const clean = validateChatText(text, match.settings);
      const edited = clean !== draft.text;
      const seat = edited ? match.useIntervention(auth.playerId) : match.seatById(draft.seatId)!;
      seat.reviewNext = false;
      this.postAiMessage(em, match, seat, clean, {
        brokeCharacter: edited ? false : draft.brokeCharacter,
        isIntervention: edited,
      });
      await em.flush();
      await this.presenter.broadcast(em, auth.roomId);
    });
  }

  private sendDraftToMaster(match: GameMatch, seat: Seat, text: string, brokeCharacter: boolean) {
    const draft = this.drafts.create({
      matchId: match.id,
      roomId: match.roomId,
      seatId: seat.id,
      masterPlayerId: seat.playerId,
      text,
      brokeCharacter,
    });
    this.realtime.toPlayer(seat.playerId, 'master:draft', {
      draftId: draft.id,
      text,
      expiresAt: draft.expiresAt.toISOString(),
    });
    this.scheduler.at(`draft:${draft.id}`, draft.expiresAt, () => this.expireDraft(draft.id));
  }

  /** O Mestre não revisou a tempo: a resposta original vai como está. */
  private async expireDraft(draftId: string): Promise<void> {
    const draft = this.drafts.take(draftId);
    if (!draft) return;
    await this.tx.run(draft.roomId, async (em) => {
      const match = await em.findOne(GameMatch, { id: draft.matchId });
      const seat = match?.seatById(draft.seatId);
      if (!match || !seat || match.phase !== 'conversation') return;
      seat.reviewNext = false;
      this.postAiMessage(em, match, seat, draft.text, {
        brokeCharacter: draft.brokeCharacter,
        isIntervention: false,
      });
      this.realtime.toPlayer(seat.playerId, 'match:notice', {
        kind: 'info',
        text: 'O tempo para editar acabou: a resposta original foi enviada.',
      });
      await em.flush();
      await this.presenter.broadcast(em, draft.roomId);
    });
  }

  /** Mostra "digitando..." pelo tempo proporcional ao texto e depois entrega. */
  private postAiMessage(
    em: EntityManager,
    match: GameMatch,
    seat: Seat,
    text: string,
    flags: { brokeCharacter: boolean; isIntervention: boolean },
  ): void {
    const now = new Date();
    match.registerAiMessage(seat.id, now, flags.brokeCharacter);
    const typingMs = typingDurationMs(text, match.settings, this.random);
    const message = ChatMessage.create({
      matchId: match.id,
      seatId: seat.id,
      kind: 'chat',
      text,
      now,
      delayMs: typingMs,
      isAi: true,
      isIntervention: flags.isIntervention,
      brokeCharacter: flags.brokeCharacter,
    });
    if (typingMs > 0) {
      this.realtime.toRoom(match.roomId, 'chat:typing', { seatId: seat.id, durationMs: typingMs });
    }
    this.delivery.post(em, match, message, 'message');
  }
}
