import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ChatMessageView, MatchView, RevealView, RoomStateView } from '@quem/shared';
import { Player } from '../../rooms/domain/player';
import { Room } from '../../rooms/domain/room';
import { avatarUrl } from '../../rooms/application/rooms.service';
import { ChatMessage } from '../domain/chat-message';
import { DEFAULT_PERSONA } from '../domain/content';
import { GameMatch } from '../domain/game-match';
import { phaseDurationMs } from '../domain/match-state-machine';
import { isCorrectVote } from '../domain/scoring';
import { findCurrentMatch } from './match-queries';
import { Realtime } from './realtime';

interface RoomSnapshot {
  room: Room;
  players: Player[];
  match: GameMatch | null;
}

/**
 * Monta o que cada jogador pode ver. É aqui que o segredo é protegido:
 * a mesma partida vira uma view diferente para o Mestre, para os jogadores
 * e para quem chegou atrasado. O cliente nunca recebe o estado completo
 * antes da revelação.
 */
@Injectable()
export class RoomPresenter {
  constructor(private readonly realtime: Realtime) {}

  /** Envia o estado atualizado para todos os jogadores conectados. */
  async broadcast(em: EntityManager, roomId: string): Promise<void> {
    const snapshot = await this.load(em, roomId);
    for (const playerId of this.realtime.connectedPlayerIds(roomId)) {
      this.realtime.toPlayer(playerId, 'room:state', this.view(snapshot, playerId));
    }
  }

  /** Estado + histórico do chat para um jogador (ao conectar ou reconectar). */
  async sendSnapshotTo(em: EntityManager, roomId: string, playerId: string): Promise<void> {
    const snapshot = await this.load(em, roomId);
    this.realtime.toPlayer(playerId, 'room:state', this.view(snapshot, playerId));
    const history = snapshot.match ? await this.history(em, snapshot.match) : [];
    this.realtime.toPlayer(playerId, 'chat:history', history);
  }

  /** Na revelação, todo mundo recebe o histórico com as mensagens da IA marcadas. */
  async sendHistoryToRoom(em: EntityManager, match: GameMatch): Promise<void> {
    this.realtime.toRoom(match.roomId, 'chat:history', await this.history(em, match));
  }

  async history(em: EntityManager, match: GameMatch, now = new Date()): Promise<ChatMessageView[]> {
    const revealed = match.isFinished();
    const messages = await em.find(
      ChatMessage,
      revealed ? { matchId: match.id } : { matchId: match.id, visibleAt: { $lte: now } },
      { orderBy: { visibleAt: 'asc' } },
    );
    return messages.map((m) => toMessageView(m, revealed));
  }

  private async load(em: EntityManager, roomId: string): Promise<RoomSnapshot> {
    const room = await em.findOneOrFail(Room, { id: roomId });
    const players = await em.find(Player, { roomId }, { orderBy: { joinedAt: 'asc' } });
    const match = await findCurrentMatch(em, roomId);
    return { room, players, match };
  }

  view(snapshot: RoomSnapshot, playerId: string, now = new Date()): RoomStateView {
    const { room, players, match } = snapshot;
    const online = this.realtime.connectedPlayerIds(room.id);
    const me = players.find((p) => p.id === playerId);
    return {
      code: room.code,
      hostPlayerId: room.hostPlayerId ?? '',
      settings: room.settings,
      players: players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        avatarUrl: avatarUrl(p.avatarKey),
        connected: online.has(p.id),
        totalScore: p.totalScore,
        isHost: room.isHost(p.id),
      })),
      me: { playerId, nickname: me?.nickname ?? '' },
      match: match ? matchView(match, players, playerId, now) : null,
      serverTime: now.toISOString(),
    };
  }
}

function matchView(match: GameMatch, players: Player[], playerId: string, now: Date): MatchView {
  const seat = match.seatOfPlayer(playerId);
  const playerSeats = match.playerSeats();
  const flashOpen = match.flash && new Date(match.flash.endsAt) > now;
  const showDeadline = match.deadlineVisibleTo(playerId);

  return {
    id: match.id,
    number: match.number,
    phase: match.phase,
    phaseEndsAt: showDeadline ? (match.phaseEndsAt?.toISOString() ?? null) : null,
    phaseDurationMs: showDeadline ? phaseDurationMs(match.phase, match.settings) : null,
    role: seat ? seat.role : 'spectator',
    mySeatId: seat?.role === 'player' ? seat.id : null,
    seats:
      match.phase === 'creation'
        ? []
        : match.seats.map((s) => ({ seatId: s.id, pseudonym: s.pseudonym, avatar: s.avatar })),
    theme: match.theme,
    flash: flashOpen ? match.flash : null,
    votes: {
      voted: playerSeats.filter((s) => s.vote).length,
      // Com o número de IAs secreto, mostrar quantos votam entregaria quantos Mestres existem.
      eligible: match.settings.secretAiCount ? null : playerSeats.length,
      mine: seat?.vote ? { target: seat.vote.target, locked: seat.vote.locked } : null,
    },
    canVote: match.canVote(playerId),
    master:
      seat?.role === 'master'
        ? {
            aiSeatId: seat.id,
            submitted: seat.submitted,
            persona: seat.persona,
            mirrorSamples: seat.mirrorSamples,
            interventionsLeft: seat.interventionsLeft,
            reviewNext: seat.reviewNext,
            usingOwnKey: seat.usingOwnKey,
          }
        : null,
    aiResting: match.aiResting,
    reveal: match.isFinished() ? revealView(match, players) : null,
  };
}

function revealView(match: GameMatch, players: Player[]): RevealView {
  const nickname = (id: string) => players.find((p) => p.id === id)?.nickname ?? '???';
  const aiSeatIds = match.masterSeats().map((s) => s.id);
  const { deceivedByMaster } = match.score();

  return {
    aiSeatIds,
    seats: match.seats.map((s) => ({
      seatId: s.id,
      pseudonym: s.pseudonym,
      avatar: s.avatar,
      playerId: s.playerId,
      nickname: nickname(s.playerId),
      role: s.role,
    })),
    masters: match.masterSeats().map((m) => ({
      playerId: m.playerId,
      nickname: nickname(m.playerId),
      aiSeatId: m.id,
      persona: m.persona ?? DEFAULT_PERSONA,
      mirrorSamples: m.mirrorSamples,
      brokeCharacter: m.brokeCharacter,
      deceived: deceivedByMaster[m.playerId] ?? 0,
    })),
    votes: match.playerSeats().map((s) => ({
      playerId: s.playerId,
      nickname: nickname(s.playerId),
      target: s.vote?.target ?? null,
      locked: s.vote?.locked ?? false,
      correct: s.vote ? isCorrectVote(s.vote.target, aiSeatIds) : false,
    })),
    scores: (match.scores ?? []).map((line) => ({ ...line, nickname: nickname(line.playerId) })),
  };
}

export function toMessageView(message: ChatMessage, revealed: boolean): ChatMessageView {
  return {
    id: message.id,
    seatId: message.seatId,
    kind: message.kind,
    text: message.text,
    sentAt: message.visibleAt.toISOString(),
    ...(revealed
      ? {
          reveal: {
            isAi: message.isAi,
            isIntervention: message.isIntervention,
            brokeCharacter: message.brokeCharacter,
          },
        }
      : {}),
  };
}
