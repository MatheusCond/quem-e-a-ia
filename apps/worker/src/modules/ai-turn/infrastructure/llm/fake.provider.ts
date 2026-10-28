import { LlmProvider, LlmRequest, LlmResponse } from './llm-provider';

const REPLIES = [
  'kkkk sei la',
  'serio isso?',
  'ah eu acho que nao',
  'mano eu tava pensando nisso agora',
  'nossa q pergunta dificil',
  'eu voto no que falou por ultimo kkk',
  'ja passei por isso, foi horrivel',
  'pera que eu to comendo',
  'hmmm faz sentido',
  'quem ta mais quieto ai hein',
  'nao sei vcs mas eu prefiro pizza',
  'kkkkkkk para',
];

/**
 * Provedor falso e determinístico: a mesma conversa sempre gera a mesma
 * resposta. Usado nos testes e quando não existe chave de IA configurada,
 * para o jogo funcionar sem rede e sem custo.
 *
 * Os "tokens" são uma estimativa (caracteres ÷ 4), só para o disjuntor e as
 * métricas terem números; não são tokens reais de nenhum modelo.
 */
export class FakeLlmProvider extends LlmProvider {
  readonly name = 'fake';

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const text = REPLIES[hash(request.user) % REPLIES.length];
    return {
      text,
      usage: {
        inputTokens: Math.ceil((request.system.length + request.user.length) / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
    };
  }
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) >>> 0;
  return h;
}
