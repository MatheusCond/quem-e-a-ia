import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { MessageBus } from '@quem/cloud';
import { QUEUES } from '@quem/shared';
import { MESSAGE_BUS } from '../../../infrastructure/infrastructure.module';
import { ChatService } from '../application/chat.service';
import { MatchService } from '../application/match.service';
import { RankingService } from '../application/ranking.service';

/**
 * Entradas da API que vêm por fila (SQS), não pelo navegador:
 *
 * - ai-replies-api: respostas do worker e avisos do disjuntor de orçamento;
 * - match-ranking: fim de partida, para somar o ranking da sala.
 *
 * Em Spring seriam métodos com @SqsListener.
 */
@Injectable()
export class QueueConsumers implements OnModuleInit {
  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly chat: ChatService,
    private readonly matches: MatchService,
    private readonly ranking: RankingService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(QUEUES.aiRepliesApi, async (event) => {
      if (event.type === 'ai.reply') await this.chat.handleAiReply(event);
      if (event.type === 'ai.unavailable') await this.matches.handleAiUnavailable(event);
    });

    this.bus.subscribe(QUEUES.matchRanking, async (event) => {
      if (event.type === 'match.finished') await this.ranking.apply(event);
    });
  }
}
