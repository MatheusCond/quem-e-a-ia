import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { GameError } from '../../../shared/game-error';
import { CurrentPlayer, PlayerAuthGuard } from '../../auth/player-auth.guard';
import { AuthPlayer } from '../../auth/player-token.service';
import { RoomsService } from '../application/rooms.service';
import { NicknameDto } from './rooms.dto';

const MAX_AVATAR_BYTES = 1024 * 1024;

@Controller()
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post('rooms')
  create(@Body() body: NicknameDto) {
    return this.rooms.createRoom(body.nickname);
  }

  @Post('rooms/:code/players')
  join(@Param('code') code: string, @Body() body: NicknameDto) {
    return this.rooms.joinRoom(code, body.nickname);
  }

  @Get('rooms/:code')
  summary(@Param('code') code: string) {
    return this.rooms.getSummary(code);
  }

  @Put('players/me/avatar')
  @UseGuards(PlayerAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES } }))
  uploadAvatar(
    @CurrentPlayer() player: AuthPlayer,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new GameError('VALIDATION', 'Nenhuma imagem enviada.');
    return this.rooms.setAvatar(player, file);
  }

  /** Repassa a imagem do S3; o bucket nunca fica exposto ao navegador. */
  @Get('avatars/:key')
  @SkipThrottle()
  async avatar(@Param('key') key: string, @Res() res: Response) {
    const object = await this.rooms.getAvatar(key);
    if (!object) throw new NotFoundException();
    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    object.body.pipe(res);
  }
}
