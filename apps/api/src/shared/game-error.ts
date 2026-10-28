import { ApiErrorBody, ErrorCode } from '@quem/shared';

/**
 * Erro de regra de negócio. O domínio lança, a camada de entrada (REST ou
 * WebSocket) converte para a resposta do cliente. Em Spring seria uma
 * exceção de negócio tratada por um @ControllerAdvice.
 */
export class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }

  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message };
  }
}
