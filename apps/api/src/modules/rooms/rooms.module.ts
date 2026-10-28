import { Module } from '@nestjs/common';
import { RoomsService } from './application/rooms.service';
import { RoomsController } from './infrastructure/rooms.controller';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
