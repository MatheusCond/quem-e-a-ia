import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@quem/shared';
import { Response } from 'express';
import { GameError } from '../../shared/game-error';

const STATUS: Partial<Record<ErrorCode, HttpStatus>> = {
  ROOM_NOT_FOUND: HttpStatus.NOT_FOUND,
  ROOM_FULL: HttpStatus.CONFLICT,
  MATCH_IN_PROGRESS: HttpStatus.CONFLICT,
  NOT_HOST: HttpStatus.FORBIDDEN,
  NOT_ALLOWED: HttpStatus.FORBIDDEN,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Converte GameError em resposta HTTP. Equivale a um @ControllerAdvice. */
@Catch(GameError)
export class GameErrorFilter implements ExceptionFilter {
  catch(error: GameError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(STATUS[error.code] ?? HttpStatus.BAD_REQUEST).json(error.toBody());
  }
}
