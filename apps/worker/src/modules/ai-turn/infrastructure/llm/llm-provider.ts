export interface LlmRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage;
}

/**
 * Contrato de um provedor de LLM. O worker só conhece esta interface; qual
 * implementação roda é escolhido pela variável LLM_PROVIDER.
 * Em Java seria uma interface com três @Component e um @Qualifier.
 */
export abstract class LlmProvider {
  abstract readonly name: string;
  abstract generate(request: LlmRequest): Promise<LlmResponse>;
}

/** HTTP 429: a cota do provedor acabou. Dispara o disjuntor. */
export class LlmQuotaError extends Error {
  constructor(message = 'Cota do provedor de IA esgotada') {
    super(message);
    this.name = 'LlmQuotaError';
  }
}

export class LlmRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRequestError';
  }
}

/** fetch com timeout, para uma chamada lenta não segurar a fila. */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new LlmRequestError(`Falha de rede: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
