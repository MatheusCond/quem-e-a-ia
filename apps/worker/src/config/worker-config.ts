import { Logger } from '@nestjs/common';
import {
  AwsConnection,
  awsConnectionFromEnv,
  loadSecrets,
  MessageBusDriver,
  messageBusDriverFromEnv,
} from '@quem/cloud';

export type LlmProviderName = 'gemini' | 'ollama' | 'fake';

/**
 * Configuração do worker. Todos os limites de custo de IA vêm de variáveis
 * de ambiente, para ajustar sem mexer no código.
 */
export interface WorkerConfig {
  port: number;
  databaseUrl: string;
  aws: AwsConnection;
  messageBus: MessageBusDriver;
  llm: {
    provider: LlmProviderName;
    geminiApiKey: string | null;
    geminiModel: string;
    ollamaUrl: string;
    ollamaModel: string;
    timeoutMs: number;
  };
  byokEncryptionKey: string;
  limits: {
    /** Respostas da IA por partida (por lugar de IA). */
    maxRepliesPerMatch: number;
    /** Tamanho máximo da resposta pedida ao modelo. */
    maxOutputTokens: number;
    /** Quantas mensagens recentes vão no prompt. */
    contextMessages: number;
    /** Disjuntor diário: chamadas e tokens somados de todas as salas. */
    dailyMaxCalls: number;
    dailyMaxTokens: number;
    /** Intervalo mínimo entre duas falas da mesma IA. */
    minReplyGapMs: number;
  };
}

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

export async function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkerConfig> {
  const aws = awsConnectionFromEnv(env);
  const secrets = await loadSecrets({
    secretId: env.SECRETS_ID,
    keys: ['GEMINI_API_KEY', 'BYOK_ENCRYPTION_KEY'],
    connection: aws,
    logger: new Logger('Secrets'),
    env,
  });
  if (!secrets.BYOK_ENCRYPTION_KEY) {
    throw new Error('Configuração ausente: BYOK_ENCRYPTION_KEY (Secrets Manager ou .env)');
  }

  return {
    port: intFrom(env.PORT, 3001),
    databaseUrl: env.DATABASE_URL ?? 'postgresql://quem:quem@localhost:5432/quem_e_a_ia',
    aws,
    messageBus: messageBusDriverFromEnv(env),
    llm: {
      provider: parseProvider(env.LLM_PROVIDER),
      geminiApiKey: secrets.GEMINI_API_KEY ?? null,
      geminiModel: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
      ollamaModel: env.OLLAMA_MODEL || 'qwen2.5:1.5b',
      timeoutMs: intFrom(env.LLM_TIMEOUT_MS, 20_000),
    },
    byokEncryptionKey: secrets.BYOK_ENCRYPTION_KEY,
    limits: {
      maxRepliesPerMatch: intFrom(env.AI_MAX_REPLIES_PER_MATCH, 40),
      maxOutputTokens: intFrom(env.AI_MAX_OUTPUT_TOKENS, 80),
      contextMessages: intFrom(env.AI_CONTEXT_MESSAGES, 12),
      dailyMaxCalls: intFrom(env.AI_DAILY_MAX_CALLS, 400),
      dailyMaxTokens: intFrom(env.AI_DAILY_MAX_TOKENS, 400_000),
      minReplyGapMs: intFrom(env.AI_MIN_REPLY_GAP_MS, 4000),
    },
  };
}

function parseProvider(value: string | undefined): LlmProviderName {
  return value === 'ollama' || value === 'fake' ? value : 'gemini';
}

function intFrom(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
