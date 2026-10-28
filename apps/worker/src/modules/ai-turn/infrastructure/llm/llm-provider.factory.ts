import { Logger } from '@nestjs/common';
import { WorkerConfig } from '../../../../config/worker-config';
import { FakeLlmProvider } from './fake.provider';
import { GeminiProvider } from './gemini.provider';
import { LlmProvider } from './llm-provider';
import { OllamaProvider } from './ollama.provider';

/**
 * Escolhe o provedor padrão pela configuração. Sem chave do Gemini, cai no
 * provedor falso: o jogo continua rodando, só que com respostas prontas.
 */
export function createDefaultProvider(config: WorkerConfig): LlmProvider {
  const logger = new Logger('LlmProvider');
  const { llm } = config;

  if (llm.provider === 'ollama') {
    logger.log(`Usando Ollama (${llm.ollamaModel})`);
    return new OllamaProvider(llm.ollamaUrl, llm.ollamaModel, llm.timeoutMs);
  }
  if (llm.provider === 'gemini' && llm.geminiApiKey) {
    logger.log(`Usando Gemini (${llm.geminiModel})`);
    return new GeminiProvider(llm.geminiApiKey, llm.geminiModel, llm.timeoutMs);
  }
  if (llm.provider === 'gemini') {
    logger.warn('GEMINI_API_KEY não configurada: usando o FakeLlmProvider');
  }
  return new FakeLlmProvider();
}

/** "Usar minha própria chave": um Gemini só para aquela chamada. */
export function createOwnKeyProvider(apiKey: string, config: WorkerConfig): LlmProvider {
  return new GeminiProvider(apiKey, config.llm.geminiModel, config.llm.timeoutMs);
}
