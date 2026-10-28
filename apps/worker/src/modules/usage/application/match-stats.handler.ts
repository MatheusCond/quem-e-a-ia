import { Injectable, Logger } from '@nestjs/common';
import { MatchFinishedEvent } from '@quem/shared';
import { UsageRepository } from './usage-repository';

/**
 * Consome "match.finished" (fila match-stats) e grava a fotografia da
 * partida junto com o consumo de IA. É de onde saem as médias reais de
 * chamadas e tokens por partida mostradas em GET /stats.
 */
@Injectable()
export class MatchStatsHandler {
  private readonly logger = new Logger(MatchStatsHandler.name);

  constructor(private readonly repository: UsageRepository) {}

  async handle(event: MatchFinishedEvent): Promise<void> {
    await this.repository.saveMatchStats(event);
    this.logger.log(`Estatísticas gravadas (sala ${event.roomCode}, partida ${event.matchId})`);
  }
}
