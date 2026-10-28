import { Injectable, Logger } from '@nestjs/common';
import { MatchFinishedEvent } from '@quem/shared';
import { RoomTransaction } from '../../../infrastructure/database/room-transaction';
import { Player } from '../../rooms/domain/player';
import { GameMatch } from '../domain/game-match';
import { RoomPresenter } from './room-presenter';

/**
 * Soma os pontos da partida no ranking acumulado da sala. Roda a partir da
 * fila match-ranking (fan-out do tópico match-events), então a revelação
 * aparece na hora e o ranking atualiza um instante depois.
 */
@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    private readonly tx: RoomTransaction,
    private readonly presenter: RoomPresenter,
  ) {}

  async apply(event: MatchFinishedEvent): Promise<void> {
    await this.tx.run(event.roomId, async (em) => {
      const match = await em.findOne(GameMatch, { id: event.matchId });
      if (!match) return;

      // Idempotente: se a mensagem chegar duas vezes, a segunda não soma nada.
      const deltas = match.takeRankingDeltas();
      if (deltas.length === 0) return;

      const players = await em.find(Player, { id: { $in: deltas.map((d) => d.playerId) } });
      for (const { playerId, delta } of deltas) {
        const player = players.find((p) => p.id === playerId);
        if (player) player.totalScore += delta;
      }
      await em.flush();
      await this.presenter.broadcast(em, event.roomId);
      this.logger.log(`Ranking atualizado (sala ${event.roomCode}, partida ${match.number})`);
    });
  }
}
