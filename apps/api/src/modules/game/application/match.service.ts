import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MessageBus } from '@quem/cloud';
import {
  AiUnavailableEvent,
  CreationPayload,
  MatchFinishedEvent,
  MatchPhase,
  TOPICS,
  VoteTarget,
} from '@quem/shared';
import { APP_CONFIG, AppConfig } from '../../../config/app-config';
import { RoomTransaction } from '../../../infrastructure/database/room-transaction';
import { MESSAGE_BUS } from '../../../infrastructure/infrastructure.module';
import { Scheduler } from '../../../infrastructure/scheduler';
import { GameError } from '../../../shared/game-error';
import { pickOne, Random, RANDOM } from '../../../shared/random';
import { AuthPlayer } from '../../auth/player-token.service';
import { normalizeChatName, Player } from '../../rooms/domain/player';
import { Room } from '../../rooms/domain/room';
import { ChatMessage } from '../domain/chat-message';
import { FLASH_QUESTIONS } from '../domain/content';
import { GameMatch } from '../domain/game-match';
import { AuditExporter } from './audit-exporter';
import { DraftStore } from './draft-store';
import { findCurrentMatch, requireCurrentMatch } from './match-queries';
import { MessageDelivery } from './message-delivery';
import { OwnKeyVault } from './own-key-vault';
import { Realtime } from './realtime';
import { RoomPresenter } from './room-presenter';

/** A pergunta-relâmpago aparece quando 40% da conversa já passou. */
const FLASH_AT_FRACTION = 0.4;
const FLASH_MIN_CONVERSATION_SECONDS = 60;

/**
 * Casos de uso da partida: começar, criar a IA, avançar fases, votar e
 * encerrar. O servidor é a autoridade: todo prazo e todo sorteio acontecem
 * aqui, o navegador só mostra o resultado.
 */
@Injectable()
export class MatchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    private readonly tx: RoomTransaction,
    private readonly presenter: RoomPresenter,
    private readonly realtime: Realtime,
    private readonly scheduler: Scheduler,
    private readonly delivery: MessageDelivery,
    private readonly vault: OwnKeyVault,
    private readonly drafts: DraftStore,
    private readonly audit: AuditExporter,
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  // ------------------------------------------------------------ conexões

  async playerConnected(auth: AuthPlayer): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      await this.presenter.broadcast(em, auth.roomId);
      await this.presenter.sendSnapshotTo(em, auth.roomId, auth.playerId);
    });
  }

  async refreshRoom(roomId: string): Promise<void> {
    await this.tx.run(roomId, (em) => this.presenter.broadcast(em, roomId));
  }

  // ------------------------------------------------------------ sala

  async updateSettings(auth: AuthPlayer, input: unknown): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const room = await em.findOneOrFail(Room, { id: auth.roomId });
      room.updateSettings(auth.playerId, input);
      await em.flush();
      await this.presenter.broadcast(em, room.id);
    });
  }

  /** Nome que o jogador usa no chat das próximas partidas. Vazio volta ao sorteio. */
  async setChatName(auth: AuthPlayer, input: unknown): Promise<void> {
    const name = normalizeChatName(String(input ?? ''));
    await this.tx.run(auth.roomId, async (em) => {
      const players = await em.find(Player, { roomId: auth.roomId });
      const me = players.find((p) => p.id === auth.playerId);
      if (!me) throw new GameError('UNAUTHORIZED', 'Jogador não encontrado nesta sala.');
      const taken = players.some(
        (p) => p.id !== me.id && name && p.chatName?.toLowerCase() === name.toLowerCase(),
      );
      if (taken) {
        throw new GameError('VALIDATION', 'Alguém da sala já escolheu esse nome. Tente outro.');
      }
      me.chatName = name;
      await em.flush();
      await this.presenter.broadcast(em, auth.roomId);
    });
  }

  async startMatch(auth: AuthPlayer): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const room = await em.findOneOrFail(Room, { id: auth.roomId });
      if (!room.isHost(auth.playerId)) {
        throw new GameError('NOT_HOST', 'Só quem criou a sala pode começar a partida.');
      }
      const current = await findCurrentMatch(em, room.id);
      if (current && !current.isFinished()) {
        throw new GameError('MATCH_IN_PROGRESS', 'Já existe uma partida em andamento.');
      }
      await this.assertDailyLimit(em, room.id);

      // Só joga quem está conectado agora; quem estiver fora assiste.
      const online = this.realtime.connectedPlayerIds(room.id);
      const players = await em.find(Player, { roomId: room.id }, { orderBy: { joinedAt: 'asc' } });

      const playing = players.filter((p) => online.has(p.id));
      const match = GameMatch.start({
        roomId: room.id,
        number: (current?.number ?? 0) + 1,
        playerIds: playing.map((p) => p.id),
        chatNames: new Map(
          playing.flatMap((p) => (p.chatName ? [[p.id, p.chatName] as const] : [])),
        ),
        settings: room.settings,
        now: new Date(),
        random: this.random,
      });
      em.persist(match);
      await em.flush();

      this.schedulePhaseEnd(match);
      this.realtime.toRoom(room.id, 'chat:history', []);
      await this.presenter.broadcast(em, room.id);
      this.logger.log(`Partida ${match.number} começou na sala ${room.code}`);
    });
  }

  // ------------------------------------------------------------ criação

  async submitCreation(auth: AuthPlayer, payload: CreationPayload): Promise<void> {
    const ownKey = String(payload?.ownApiKey ?? '').trim();
    if (ownKey && !/^[\w.-]{20,200}$/.test(ownKey)) {
      throw new GameError('VALIDATION', 'Essa chave de API não parece válida.');
    }

    await this.tx.run(auth.roomId, async (em) => {
      const match = await requireCurrentMatch(em, auth.roomId);
      match.submitCreation(auth.playerId, {
        persona: payload?.persona,
        mirrorSamples: payload?.mirrorSamples,
        usingOwnKey: Boolean(ownKey),
      });
      if (ownKey) this.vault.store(match.id, match.seatOfPlayer(auth.playerId)!.id, ownKey);

      if (match.allMastersReady()) {
        await this.advance(em, match);
      } else {
        await em.flush();
        await this.presenter.broadcast(em, match.roomId);
      }
    });
  }

  // ------------------------------------------------------------ votação

  async castVote(auth: AuthPlayer, target: VoteTarget): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const match = await requireCurrentMatch(em, auth.roomId);
      match.castVote(auth.playerId, String(target ?? ''), new Date());
      await this.afterVote(em, match);
    });
  }

  async lockVote(auth: AuthPlayer): Promise<void> {
    await this.tx.run(auth.roomId, async (em) => {
      const match = await requireCurrentMatch(em, auth.roomId);
      match.lockVote(auth.playerId, new Date());
      await this.afterVote(em, match);
    });
  }

  /**
   * Fecha a votação antes do prazo quando todos votaram. Com o número de IAs
   * secreto não fechamos: a votação acabar quando N-1 votaram entregaria
   * quantos Mestres existem.
   */
  private async afterVote(em: EntityManager, match: GameMatch): Promise<void> {
    if (!match.settings.secretAiCount && match.allVotesIn()) {
      await this.advance(em, match);
    } else {
      await em.flush();
      await this.presenter.broadcast(em, match.roomId);
    }
  }

  // ------------------------------------------------------------ IA fora do ar

  /** Disjuntor do worker: sem orçamento, a conversa acaba e vai para a votação. */
  async handleAiUnavailable(event: AiUnavailableEvent): Promise<void> {
    const roomId = await this.roomIdOf(event.matchId);
    if (!roomId) return;
    await this.tx.run(roomId, async (em) => {
      const match = await em.findOne(GameMatch, { id: event.matchId });
      if (!match || match.phase !== 'conversation' || match.aiResting) return;

      match.pauseAi();
      const text = 'A IA está descansando, voltem mais tarde. A conversa acabou: hora de votar!';
      this.delivery.post(em, match, ChatMessage.system(match.id, text, new Date()), null);
      this.realtime.toRoom(roomId, 'match:notice', { kind: 'ai-resting', text });
      this.logger.warn(`IA indisponível na partida ${match.id} (${event.reason})`);
      await this.advance(em, match);
    });
  }

  // ------------------------------------------------------------ fases

  /** Callback dos timers. Ignora timers velhos (a fase já mudou por outro motivo). */
  async advanceIfDue(roomId: string, matchId: string, expectedPhase: MatchPhase): Promise<void> {
    await this.tx.run(roomId, async (em) => {
      const match = await em.findOne(GameMatch, { id: matchId });
      if (!match || match.phase !== expectedPhase) return;
      if (!match.isDue(new Date())) {
        this.schedulePhaseEnd(match);
        return;
      }
      await this.advance(em, match);
    });
  }

  /** Força a próxima fase. Usado pelos testes ponta a ponta para não esperar timers. */
  async forceAdvance(roomId: string): Promise<void> {
    await this.tx.run(roomId, async (em) =>
      this.advance(em, await requireCurrentMatch(em, roomId)),
    );
  }

  private async advance(em: EntityManager, match: GameMatch): Promise<void> {
    const now = new Date();
    const phase = match.advance(now, this.random);
    this.scheduler.cancel(`phase:${match.id}`);

    if (phase === 'conversation') this.onConversationStart(em, match, now);
    if (phase === 'voting') this.scheduler.cancel(`flash:${match.id}`);
    await em.flush();

    if (phase === 'reveal') await this.onReveal(em, match);
    this.schedulePhaseEnd(match);
    await this.presenter.broadcast(em, match.roomId);
    if (phase === 'reveal') await this.presenter.sendHistoryToRoom(em, match);
  }

  private onConversationStart(em: EntityManager, match: GameMatch, now: Date): void {
    if (match.theme) {
      const text = `Tema da rodada: ${match.theme}`;
      this.delivery.post(em, match, ChatMessage.system(match.id, text, now, 'theme'), 'theme');
    }
    const seconds = match.settings.conversationSeconds;
    if (match.settings.topicAndFlash && seconds >= FLASH_MIN_CONVERSATION_SECONDS) {
      const at = new Date(now.getTime() + seconds * 1000 * FLASH_AT_FRACTION);
      this.scheduler.at(`flash:${match.id}`, at, () => this.triggerFlash(match.roomId, match.id));
    }
  }

  private async triggerFlash(roomId: string, matchId: string): Promise<void> {
    await this.tx.run(roomId, async (em) => {
      const match = await em.findOne(GameMatch, { id: matchId });
      if (!match || match.phase !== 'conversation') return;

      const now = new Date();
      const question = pickOne(FLASH_QUESTIONS, this.random);
      match.startFlash(question, now);
      const text = `⚡ Pergunta-relâmpago: ${question} Todo mundo responde em 30 segundos!`;
      this.delivery.post(em, match, ChatMessage.system(match.id, text, now, 'flash'), 'flash');
      this.realtime.toRoom(roomId, 'match:notice', { kind: 'flash', text: question });
      await em.flush();
      await this.presenter.broadcast(em, roomId);
    });
  }

  /** Efeitos depois do commit: auditoria no S3 e evento para ranking e estatísticas. */
  private async onReveal(em: EntityManager, match: GameMatch): Promise<void> {
    this.vault.forget(match.id);
    this.drafts.forgetMatch(match.id);
    this.scheduler.cancelPrefix(`flash:${match.id}`);

    const room = await em.findOneOrFail(Room, { id: match.roomId });
    match.auditKey = await this.audit.export(em, room, match);

    const scoring = match.score();
    const [aiMessages, humanMessages] = await Promise.all([
      em.count(ChatMessage, { matchId: match.id, isAi: true }),
      em.count(ChatMessage, { matchId: match.id, isAi: false, kind: 'chat' }),
    ]);
    const event: MatchFinishedEvent = {
      type: 'match.finished',
      matchId: match.id,
      roomId: room.id,
      roomCode: room.code,
      startedAt: match.startedAt.toISOString(),
      finishedAt: (match.finishedAt ?? new Date()).toISOString(),
      aiCount: match.aiCount,
      playerCount: match.seats.length,
      scores: (match.scores ?? []).map(({ playerId, delta }) => ({ playerId, delta })),
      correctVoters: scoring.correctVoters,
      totalVoters: scoring.totalVoters,
      aiMessages,
      humanMessages,
      auditKey: match.auditKey,
    };
    try {
      await this.bus.publish(TOPICS.matchEvents, event);
    } catch (error) {
      this.logger.error(`Falha ao publicar fim da partida: ${(error as Error).message}`);
    }
  }

  private schedulePhaseEnd(match: GameMatch): void {
    if (!match.phaseEndsAt) return;
    const phase = match.phase;
    this.scheduler.at(`phase:${match.id}`, match.phaseEndsAt, () =>
      this.advanceIfDue(match.roomId, match.id, phase),
    );
  }

  private async assertDailyLimit(em: EntityManager, roomId: string): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const today = await em.count(GameMatch, { roomId, startedAt: { $gte: startOfDay } });
    if (today >= this.config.limits.maxMatchesPerRoomPerDay) {
      throw new GameError(
        'DAILY_MATCH_LIMIT',
        'Esta sala chegou ao limite de partidas de hoje. Voltem amanhã!',
      );
    }
  }

  private async roomIdOf(matchId: string): Promise<string | null> {
    const match = await this.tx.read((em) => em.findOne(GameMatch, { id: matchId }));
    return match?.roomId ?? null;
  }

  /**
   * Se a API reiniciar no meio de uma partida, os timers em memória se
   * perdem. Na subida, reagendamos o fim de fase de todas as partidas abertas
   * a partir do prazo gravado no banco.
   */
  async onApplicationBootstrap(): Promise<void> {
    const open = await this.tx.read((em) =>
      em.find(GameMatch, { phase: { $in: ['creation', 'conversation', 'voting'] } }),
    );
    for (const match of open) this.schedulePhaseEnd(match);
    if (open.length) this.logger.log(`${open.length} partida(s) em andamento retomada(s)`);
  }
}
