import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { ObjectStorage } from '../../../infrastructure/storage/object-storage';
import { Player } from '../../rooms/domain/player';
import { Room } from '../../rooms/domain/room';
import { ChatMessage } from '../domain/chat-message';
import { GameMatch } from '../domain/game-match';

/**
 * Exporta a partida inteira para o S3 como JSON de auditoria: quem era quem,
 * o prompt de cada Mestre, todas as mensagens (marcando as da IA), votos e
 * pontos. Útil para investigar denúncias e para revisar partidas.
 */
@Injectable()
export class AuditExporter {
  private readonly logger = new Logger(AuditExporter.name);

  constructor(private readonly storage: ObjectStorage) {}

  async export(em: EntityManager, room: Room, match: GameMatch): Promise<string | null> {
    try {
      const players = await em.find(Player, { roomId: room.id });
      const messages = await em.find(
        ChatMessage,
        { matchId: match.id },
        { orderBy: { visibleAt: 'asc' } },
      );
      const nickname = (id: string) => players.find((p) => p.id === id)?.nickname ?? null;
      const pseudonym = (seatId: string | null) =>
        seatId ? (match.seatById(seatId)?.pseudonym ?? null) : null;

      const document = {
        version: 1,
        exportedAt: new Date().toISOString(),
        room: { code: room.code },
        match: {
          id: match.id,
          number: match.number,
          startedAt: match.startedAt,
          finishedAt: match.finishedAt,
          aiCount: match.aiCount,
          theme: match.theme,
          settings: match.settings,
        },
        seats: match.seats.map((s) => ({
          pseudonym: s.pseudonym,
          nickname: nickname(s.playerId),
          role: s.role,
          persona: s.persona,
          mirrorSamples: s.mirrorSamples,
          usingOwnKey: s.usingOwnKey,
          aiReplies: s.aiReplies,
          brokeCharacter: s.brokeCharacter,
          vote: s.vote ? { ...s.vote, target: pseudonym(s.vote.target) ?? s.vote.target } : null,
        })),
        messages: messages.map((m) => ({
          at: m.visibleAt,
          from: pseudonym(m.seatId) ?? 'sistema',
          kind: m.kind,
          text: m.text,
          isAi: m.isAi,
          isIntervention: m.isIntervention,
          brokeCharacter: m.brokeCharacter,
        })),
        scores: (match.scores ?? []).map((line) => ({
          ...line,
          nickname: nickname(line.playerId),
        })),
      };

      const key = `matches/${room.code}/${match.number}-${match.id}.json`;
      await this.storage.put(key, JSON.stringify(document, null, 2), 'application/json');
      return key;
    } catch (error) {
      this.logger.warn(
        `Não foi possível exportar a partida ${match.id}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
