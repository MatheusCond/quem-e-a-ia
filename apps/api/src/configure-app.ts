import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from './config/app-config';
import { GameError } from './shared/game-error';

/**
 * Configuração HTTP compartilhada entre o main.ts e os testes ponta a ponta,
 * para os testes rodarem a aplicação exatamente como em produção.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigin });
  // Atrás do nginx, o IP real do jogador vem no X-Forwarded-For (usado no limite por IP).
  app.set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      exceptionFactory: (errors) => {
        const first = errors[0]?.constraints ?? {};
        return new GameError('VALIDATION', Object.values(first)[0] ?? 'Dados inválidos.');
      },
    }),
  );
}
