import {
  fetchWithTimeout,
  LlmProvider,
  LlmQuotaError,
  LlmRequest,
  LlmRequestError,
  LlmResponse,
} from './llm-provider';

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Modelo aberto rodando localmente no Ollama (perfil "ollama" do docker
 * compose). Não precisa de internet nem de chave e não tem custo.
 */
export class OllamaProvider extends LlmProvider {
  readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {
    super();
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          options: { num_predict: request.maxOutputTokens, temperature: 0.9 },
        }),
      },
      this.timeoutMs,
    );

    if (response.status === 429) throw new LlmQuotaError();
    if (!response.ok) throw new LlmRequestError(`Ollama respondeu HTTP ${response.status}`);

    const body = (await response.json()) as OllamaChatResponse;
    return {
      text: body.message?.content ?? '',
      usage: { inputTokens: body.prompt_eval_count ?? 0, outputTokens: body.eval_count ?? 0 },
    };
  }
}
