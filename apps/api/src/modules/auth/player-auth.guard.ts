import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthPlayer, PlayerTokenService } from './player-token.service';

type AuthenticatedRequest = Request & { player?: AuthPlayer };

/** Exige "Authorization: Bearer <token>" nas rotas REST protegidas. */
@Injectable()
export class PlayerAuthGuard implements CanActivate {
  constructor(private readonly tokens: PlayerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    request.player = this.tokens.verify(token);
    return true;
  }
}

/** Injeta o jogador autenticado no parâmetro do controller. */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPlayer =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().player!,
);
