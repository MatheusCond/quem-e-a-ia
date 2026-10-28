import {
  fetchWithTimeout,
  LlmProvider,
  LlmQuotaError,
  LlmRequest,
  LlmRequestError,
  LlmResponse,
} from './llm-provider';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Google Gemini pela API REST (generateContent). Sem SDK: é uma requisição
 * HTTP só, e assim fica claro o que vai e o que volta.
 *
 * A chave vai no header x-goog-api-key, nunca na URL (URLs aparecem em logs).
 */
export class GeminiProvider extends LlmProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {
    super();
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetchWithTimeout(
      `${BASE_URL}/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            temperature: 1,
            // Sem "pensamento": a resposta é curta e cada token de raciocínio custa cota.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
      this.timeoutMs,
    );

    if (response.status === 429) throw new LlmQuotaError();
    if (!response.ok) {
      // Só o status: o corpo do erro pode repetir dados da requisição.
      throw new LlmRequestError(`Gemini respondeu HTTP ${response.status}`);
    }

    const body = (await response.json()) as GeminiResponse;
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    return {
      text,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
