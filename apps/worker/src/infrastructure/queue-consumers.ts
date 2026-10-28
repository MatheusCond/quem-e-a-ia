import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { MessageBus } from '@quem/cloud';
import { QUEUES } from '@quem/shared';
import { AiTurnHandler } from '../modules/ai-turn/application/ai-turn.handler';
import { MatchStatsHandler } from '../modules/usage/application/match-stats.handler';
import { MESSAGE_BUS } from './tokens';

/** Liga as filas SQS aos handlers e começa a consumir quando o app sobe. */
@Injectable()
export class QueueConsumers implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly aiTurns: AiTurnHandler,
    private readonly stats: MatchStatsHandler,
  ) {}

  onApplicationBootstrap(): void {
    this.bus.subscribe(QUEUES.aiTurns, async (event) => {
      if (event.type === 'ai.turn.requested') await this.aiTurns.handle(event);
    });
    this.bus.subscribe(QUEUES.matchStats, async (event) => {
      if (event.type === 'match.finished') await this.stats.handle(event);
    });
    this.bus.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.bus.stop();
  }
}
