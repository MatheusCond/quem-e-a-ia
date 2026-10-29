import { randomUUID } from 'node:crypto';
import {
  findBlockedTerm,
  GAME_RULES,
  MatchPhase,
  NO_AI_VOTE,
  RoomSettings,
  VoteTarget,
} from '@quem/shared';
import { GameError } from '../../../shared/game-error';
import { pickOne, Random } from '../../../shared/random';
import { assertCooldown, validateChatText } from './chat-rules';
import { DEFAULT_PERSONA, THEMES } from './content';
import { assertTransition, nextPhase, phaseDurationMs } from './match-state-machine';
import { computeScores, ScoreLine, ScoringResult } from './scoring';
import { drawSeats, Seat } from './seat';

export interface CreationInput {
  persona: string;
  mirrorSamples?: string[];
  usingOwnKey: boolean;
}

/**
 * Agregado principal: uma partida dentro de uma sala.
 *
 * Toda regra que muda o estado da partida passa por um método desta classe.
 * Ela não conhece banco, WebSocket nem fila; recebe "agora" e "random" como
 * parâmetros para ser 100% testável.
 */
export class GameMatch {
  id: string;
  roomId: string;
  number: number;
  phase: MatchPhase;
  phaseEndsAt: Date | null;
  /** Cópia das configurações da sala no início: mudar a sala não afeta a partida. */
  settings: RoomSettings;
  seats: Seat[];
  aiCount: number;
  theme: string | null;
  flash: { question: string; endsAt: string } | null;
  aiResting: boolean;
  startedAt: Date;
  conversationStartedAt: Date | null;
  finishedAt: Date | null;
  scores: ScoreLine[] | null;
  auditKey: string | null;
  /**
   * O ranking é atualizado por um consumidor de fila. O SQS entrega "pelo
   * menos uma vez", então a mesma mensagem pode chegar duas vezes; esta flag
   * impede que a pontuação seja somada em dobro.
   */
  rankingApplied: boolean;

  static start(params: {
    roomId: string;
    number: number;
    playerIds: string[];
    /** Nomes que os jogadores escolheram para o chat (por playerId). */
    chatNames?: ReadonlyMap<string, string>;
    settings: RoomSettings;
    now: Date;
    random: Random;
  }): GameMatch {
    const { playerIds, settings, now, random } = params;
    if (playerIds.length < GAME_RULES.minPlayers) {
      throw new GameError(
        'NOT_ENOUGH_PLAYERS',
        `São precisos pelo menos ${GAME_RULES.minPlayers} jogadores conectados.`,
      );
    }

    const match = new GameMatch();
    match.id = randomUUID();
    match.roomId = params.roomId;
    match.number = params.number;
    match.phase = 'lobby';
    match.phaseEndsAt = null;
    match.settings = { ...settings };
    match.seats = drawSeats(playerIds, settings, random, params.chatNames);
    match.aiCount = match.masterSeats().length;
    match.theme = null;
    match.flash = null;
    match.aiResting = false;
    match.startedAt = now;
    match.conversationStartedAt = null;
    match.finishedAt = null;
    match.scores = null;
    match.auditKey = null;
    match.rankingApplied = false;

    match.transitionTo('creation', now, random);
    return match;
  }

  // ---------------------------------------------------------------- fases

  /** Avança para a próxima fase. Chamado pelo timer ou quando todos terminaram. */
  advance(now: Date, random: Random): MatchPhase {
    const next = nextPhase(this.phase);
    this.transitionTo(next, now, random);
    return next;
  }

  isDue(now: Date): boolean {
    return this.phaseEndsAt !== null && this.phaseEndsAt.getTime() <= now.getTime();
  }

  isFinished(): boolean {
    return this.phase === 'reveal';
  }

  /**
   * Quem pode ver o prazo da fase. Com o número de IAs secreto, a criação de
   * uma partida sem IA termina num momento aleatório: mostrar o cronômetro
   * para quem espera entregaria que não existe Mestre. Só o Mestre vê.
   */
  deadlineVisibleTo(playerId: string): boolean {
    if (this.phase !== 'creation' || !this.settings.secretAiCount) return true;
    return this.isMaster(playerId);
  }

  private transitionTo(next: MatchPhase, now: Date, random: Random): void {
    assertTransition(this.phase, next);
    this.phase = next;
    const duration = phaseDurationMs(next, this.settings);
    this.phaseEndsAt = duration === null ? null : new Date(now.getTime() + duration);

    switch (next) {
      case 'creation':
        if (this.aiCount === 0) {
          // Sem Mestre, ninguém "termina" a criação. Encerrar num momento
          // aleatório evita que a espera sempre cheia denuncie "zero IAs".
          const fraction = 0.4 + random() * 0.6;
          this.phaseEndsAt = new Date(now.getTime() + duration! * fraction);
        }
        break;
      case 'conversation':
        for (const master of this.masterSeats()) {
          if (!master.submitted) master.persona = DEFAULT_PERSONA;
        }
        this.conversationStartedAt = now;
        this.theme = this.settings.topicAndFlash ? pickOne(THEMES, random) : null;
        break;
      case 'voting':
        this.flash = null;
        break;
      case 'reveal':
        this.finishedAt = now;
        this.scores = this.score().lines;
        break;
    }
  }

  /** Pontos a somar no ranking da sala. Devolve a lista uma única vez. */
  takeRankingDeltas(): ScoreLine[] {
    if (!this.isFinished() || this.rankingApplied || !this.scores) return [];
    this.rankingApplied = true;
    return this.scores;
  }

  score(): ScoringResult {
    return computeScores({
      seats: this.seats,
      settings: this.settings,
      conversationStartedAt: this.conversationStartedAt,
    });
  }

  // --------------------------------------------------------------- lugares

  seatOfPlayer(playerId: string): Seat | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  seatById(seatId: string): Seat | undefined {
    return this.seats.find((s) => s.id === seatId);
  }

  masterSeats(): Seat[] {
    return this.seats.filter((s) => s.role === 'master');
  }

  playerSeats(): Seat[] {
    return this.seats.filter((s) => s.role === 'player');
  }

  isMaster(playerId: string): boolean {
    return this.seatOfPlayer(playerId)?.role === 'master';
  }

  // --------------------------------------------------------------- criação

  submitCreation(playerId: string, input: CreationInput): void {
    this.requirePhase('creation');
    const seat = this.requireMaster(playerId);

    const persona = String(input.persona ?? '').trim();
    if (persona.length < 10) {
      throw new GameError('VALIDATION', 'Descreva a personalidade com pelo menos 10 caracteres.');
    }
    if (persona.length > GAME_RULES.maxPersonaChars) {
      throw new GameError(
        'VALIDATION',
        `A personalidade pode ter até ${GAME_RULES.maxPersonaChars} caracteres.`,
      );
    }

    const samples = this.settings.mirrorMode
      ? (input.mirrorSamples ?? [])
          .map((s) => String(s).trim().slice(0, GAME_RULES.maxMirrorSampleChars))
          .filter(Boolean)
          .slice(0, GAME_RULES.maxMirrorSamples)
      : [];

    if ([persona, ...samples].some((text) => findBlockedTerm(text))) {
      throw new GameError('BLOCKED_CONTENT', 'A personalidade tem conteúdo ofensivo.');
    }

    seat.persona = persona;
    seat.mirrorSamples = samples;
    seat.usingOwnKey = input.usingOwnKey;
    seat.submitted = true;
  }

  /** Todos os Mestres prontos? Com zero Mestres, a criação só acaba no timer. */
  allMastersReady(): boolean {
    const masters = this.masterSeats();
    return masters.length > 0 && masters.every((m) => m.submitted);
  }

  // ------------------------------------------------------------------ chat

  /** Valida e registra uma mensagem humana. Devolve o lugar e o texto limpo. */
  registerHumanMessage(playerId: string, raw: string, now: Date): { seat: Seat; text: string } {
    this.requirePhase('conversation');
    const seat = this.seatOfPlayer(playerId);
    if (!seat) throw new GameError('NOT_ALLOWED', 'Você não está nesta partida.');
    if (seat.role === 'master') {
      throw new GameError('NOT_ALLOWED', 'O Mestre não digita: quem fala no seu lugar é a IA.');
    }
    const text = validateChatText(raw, this.settings);
    assertCooldown(seat.lastMessageAt, now, this.settings);
    seat.lastMessageAt = now.toISOString();
    return { seat, text };
  }

  registerAiMessage(seatId: string, now: Date, brokeCharacter: boolean): Seat {
    const seat = this.seatById(seatId);
    if (!seat || seat.role !== 'master') {
      throw new GameError('NOT_ALLOWED', 'Esse lugar não pertence a uma IA.');
    }
    seat.aiReplies++;
    seat.lastMessageAt = now.toISOString();
    seat.brokeCharacter ||= brokeCharacter;
    return seat;
  }

  startFlash(question: string, now: Date): void {
    this.requirePhase('conversation');
    const endsAt = new Date(now.getTime() + GAME_RULES.flashAnswerSeconds * 1000);
    this.flash = { question, endsAt: endsAt.toISOString() };
  }

  /** O disjuntor de orçamento desligou a IA: a conversa termina mais cedo. */
  pauseAi(): void {
    this.aiResting = true;
  }

  // ------------------------------------------------------------ intervenção

  /** Gasta uma intervenção do Mestre. Devolve o lugar da IA dele. */
  useIntervention(playerId: string): Seat {
    this.requirePhase('conversation');
    if (!this.settings.masterInterventions) {
      throw new GameError('NOT_ALLOWED', 'Intervenções estão desligadas nesta sala.');
    }
    const seat = this.requireMaster(playerId);
    if (seat.interventionsLeft <= 0) {
      throw new GameError('NO_INTERVENTIONS_LEFT', 'Você já usou todas as intervenções.');
    }
    seat.interventionsLeft--;
    return seat;
  }

  setReviewNext(playerId: string, enabled: boolean): void {
    this.requirePhase('conversation');
    const seat = this.requireMaster(playerId);
    if (enabled && (!this.settings.masterInterventions || seat.interventionsLeft <= 0)) {
      throw new GameError('NO_INTERVENTIONS_LEFT', 'Você não tem intervenções disponíveis.');
    }
    seat.reviewNext = enabled;
  }

  // --------------------------------------------------------------- votação

  canVote(playerId: string): boolean {
    const seat = this.seatOfPlayer(playerId);
    if (!seat || seat.role !== 'player') return false;
    return this.phase === 'voting' || (this.phase === 'conversation' && this.settings.voteLock);
  }

  castVote(playerId: string, target: VoteTarget, now: Date): void {
    if (!this.canVote(playerId)) {
      throw new GameError('NOT_ALLOWED', 'Você não pode votar agora.');
    }
    const seat = this.seatOfPlayer(playerId)!;
    if (seat.vote?.locked) {
      throw new GameError('VOTE_LOCKED', 'Seu voto está travado.');
    }
    this.assertValidTarget(seat, target);
    seat.vote = { target, locked: false, castAt: now.toISOString(), lockedAt: null };
  }

  lockVote(playerId: string, now: Date): void {
    if (!this.settings.voteLock) {
      throw new GameError('NOT_ALLOWED', 'Voto travado está desligado nesta sala.');
    }
    if (!this.canVote(playerId)) {
      throw new GameError('NOT_ALLOWED', 'Você não pode votar agora.');
    }
    const seat = this.seatOfPlayer(playerId)!;
    if (!seat.vote) throw new GameError('VALIDATION', 'Escolha um voto antes de travar.');
    if (seat.vote.locked) throw new GameError('VOTE_LOCKED', 'Seu voto já está travado.');
    seat.vote.locked = true;
    seat.vote.lockedAt = now.toISOString();
  }

  /**
   * Na votação, encerra antes do prazo quando todos votaram. Com `online`,
   * quem saiu da sala não segura a partida; precisa sobrar pelo menos um voto.
   */
  allVotesIn(online?: ReadonlySet<string>): boolean {
    if (this.phase !== 'voting') return false;
    const voters = this.playerSeats().filter((s) => !online || online.has(s.playerId));
    return voters.length > 0 && voters.every((s) => s.vote !== null);
  }

  private assertValidTarget(voter: Seat, target: VoteTarget): void {
    if (target === NO_AI_VOTE) {
      if (!this.settings.secretAiCount) {
        throw new GameError('VALIDATION', 'Nesta sala sempre existe uma IA.');
      }
      return;
    }
    if (!this.seatById(target)) throw new GameError('VALIDATION', 'Esse participante não existe.');
    if (target === voter.id) throw new GameError('VALIDATION', 'Você não pode votar em si mesmo.');
  }

  // ---------------------------------------------------------------- apoio

  private requirePhase(...phases: MatchPhase[]): void {
    if (!phases.includes(this.phase)) {
      throw new GameError('INVALID_PHASE', 'Essa ação não é possível nesta fase da partida.');
    }
  }

  private requireMaster(playerId: string): Seat {
    const seat = this.seatOfPlayer(playerId);
    if (!seat || seat.role !== 'master') {
      throw new GameError('NOT_ALLOWED', 'Só o Mestre da IA pode fazer isso.');
    }
    return seat;
  }
}
