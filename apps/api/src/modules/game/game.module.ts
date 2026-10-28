import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { AiTurnPublisher } from './application/ai-turn-publisher';
import { AuditExporter } from './application/audit-exporter';
import { ChatService } from './application/chat.service';
import { DraftStore } from './application/draft-store';
import { MatchService } from './application/match.service';
import { MessageDelivery } from './application/message-delivery';
import { OwnKeyVault } from './application/own-key-vault';
import { RankingService } from './application/ranking.service';
import { Realtime } from './application/realtime';
import { RoomPresenter } from './application/room-presenter';
import { GameGateway } from './infrastructure/game.gateway';
import { QueueConsumers } from './infrastructure/queue-consumers';
import { SocketRealtime } from './infrastructure/socket-realtime';

@Module({
  imports: [RoomsModule],
  providers: [
    SocketRealtime,
    // A porta Realtime e o SocketRealtime são o mesmo objeto.
    { provide: Realtime, useExisting: SocketRealtime },
    RoomPresenter,
    MessageDelivery,
    AiTurnPublisher,
    OwnKeyVault,
    DraftStore,
    AuditExporter,
    MatchService,
    ChatService,
    RankingService,
    GameGateway,
    QueueConsumers,
  ],
  exports: [MatchService, ChatService],
})
export class GameModule {}
