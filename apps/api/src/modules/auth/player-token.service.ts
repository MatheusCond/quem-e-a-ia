import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GameError } from '../../shared/game-error';

/** Quem está fazendo a requisição: um jogador dentro de uma sala. */
export interface AuthPlayer {
  playerId: string;
  roomId: string;
}

/**
 * Não há cadastro nem senha: ao entrar numa sala o jogador recebe um JWT
 * assinado pelo servidor. O navegador guarda esse token e o apresenta no
 * WebSocket e no upload de avatar. É também o que permite reconectar
 * depois de cair: o token continua valendo.
 */
@Injectable()
export class PlayerTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(player: AuthPlayer): string {
    return this.jwt.sign({ sub: player.playerId, room: player.roomId });
  }

  verify(token: string | undefined): AuthPlayer {
    if (!token) throw new GameError('UNAUTHORIZED', 'Token ausente.');
    try {
      const payload = this.jwt.verify<{ sub: string; room: string }>(token);
      return { playerId: payload.sub, roomId: payload.room };
    } catch {
      throw new GameError('UNAUTHORIZED', 'Sessão inválida. Entre na sala de novo.');
    }
  }
}
