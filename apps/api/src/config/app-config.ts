import { Logger } from '@nestjs/common';
import { AwsConnection, awsConnectionFromEnv, loadSecrets } from '@quem/cloud';

/**
 * Configuração da API, montada uma vez na subida.
 * Em Spring seria um @ConfigurationProperties; aqui é um objeto simples
 * injetado com o token APP_CONFIG.
 */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  aws: AwsConnection;
  bucket: string;
  jwtSecret: string;
  byokEncryptionKey: string;
  corsOrigin: string | boolean;
  limits: {
    maxMatchesPerRoomPerDay: number;
    requestsPerMinutePerIp: number;
    /** Quantas mensagens recentes vão no evento para o worker (ele ainda corta). */
    contextMessages: number;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const SECRET_KEYS = ['JWT_SECRET', 'BYOK_ENCRYPTION_KEY'] as const;

export async function loadAppConfig(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  const aws = awsConnectionFromEnv(env);
  const secrets = await loadSecrets({
    secretId: env.SECRETS_ID,
    keys: SECRET_KEYS,
    connection: aws,
    logger: new Logger('Secrets'),
    env,
  });

  for (const key of SECRET_KEYS) {
    if (!secrets[key]) throw new Error(`Configuração ausente: ${key} (Secrets Manager ou .env)`);
  }

  return {
    port: intFrom(env.PORT, 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgresql://quem:quem@localhost:5432/quem_e_a_ia',
    aws,
    bucket: env.S3_BUCKET ?? 'quem-e-a-ia',
    jwtSecret: secrets.JWT_SECRET,
    byokEncryptionKey: secrets.BYOK_ENCRYPTION_KEY,
    corsOrigin: env.CORS_ORIGIN || true,
    limits: {
      maxMatchesPerRoomPerDay: intFrom(env.MAX_MATCHES_PER_ROOM_PER_DAY, 30),
      requestsPerMinutePerIp: intFrom(env.RATE_LIMIT_PER_MINUTE, 60),
      contextMessages: intFrom(env.API_CONTEXT_MESSAGES, 30),
    },
  };
}

function intFrom(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
