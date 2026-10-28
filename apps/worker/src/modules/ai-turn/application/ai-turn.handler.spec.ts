import { ApiKeyCipher, InMemoryMessageBus } from '@quem/cloud';
import { AiReplyEvent, BusEvent } from '@quem/shared';
import { WorkerConfig } from '../../../config/worker-config';
import { BudgetService } from '../../usage/application/budget.service';
import { usageDay } from '../../usage/domain/budget';
import { InMemoryUsageRepository } from '../../usage/infrastructure/in-memory-usage.repository';
import { aiSeat, turnEvent } from '../domain/test-event';
import { FakeLlmProvider } from '../infrastructure/llm/fake.provider';
import { LlmProvider, LlmQuotaError, LlmRequest } from '../infrastructure/llm/llm-provider';
import { AiTurnHandler } from './ai-turn.handler';

const config = {
  llm: { geminiModel: 'gemini-test', timeoutMs: 1000 },
  limits: {
    maxRepliesPerMatch: 40,
    maxOutputTokens: 80,
    contextMessages: 12,
    dailyMaxCalls: 3,
    dailyMaxTokens: 100_000,
    minReplyGapMs: 4000,
  },
} as WorkerConfig;

const answerAll = { settings: { selectiveReplies: false, maxChars: 160 } };

class QuotaProvider extends LlmProvider {
  readonly name = 'quota';
  async generate(): Promise<never> {
    throw new LlmQuotaError();
  }
}

class RecordingProvider extends FakeLlmProvider {
  readonly requests: LlmRequest[] = [];
  override async generate(request: LlmRequest) {
    this.requests.push(request);
    return super.generate(request);
  }
}

function setup(provider: LlmProvider = new FakeLlmProvider()) {
  const bus = new InMemoryMessageBus();
  const repository = new InMemoryUsageRepository();
  const cipher = new ApiKeyCipher('test-secret');
  const handler = new AiTurnHandler(
    provider,
    new BudgetService(repository, config),
    cipher,
    bus,
    config,
    () => 0,
  );
  const published = () => bus.published.map((p) => p.event as BusEvent);
  return { handler, bus, repository, cipher, published };
}

describe('AiTurnHandler', () => {
  it('replies through the ai-replies topic with the fake provider', async () => {
    const { handler, bus, repository } = setup();
    await handler.handle(turnEvent(answerAll));

    expect(bus.published).toHaveLength(1);
    expect(bus.published[0].topic).toBe('ai-replies');
    const reply = bus.published[0].event as AiReplyEvent;
    expect(reply).toMatchObject({ type: 'ai.reply', seatId: 'seat-ai', provider: 'fake' });
    expect(reply.text.length).toBeGreaterThan(0);
    expect(repository.calls).toHaveLength(1);
  });

  it('is deterministic with the fake provider', async () => {
    const first = setup();
    const second = setup();
    await first.handler.handle(turnEvent(answerAll));
    await second.handler.handle(turnEvent(answerAll));
    expect(first.published()).toEqual(second.published());
  });

  it('opens the breaker when the daily budget is used up', async () => {
    const { handler, repository, published } = setup();
    for (let i = 0; i < 3; i++) {
      await repository.recordCall(usageDay(new Date()), {
        matchId: 'm',
        provider: 'fake',
        inputTokens: 1,
        outputTokens: 1,
        ownKey: false,
      });
    }

    await handler.handle(turnEvent(answerAll));

    expect(published()).toEqual([
      { type: 'ai.unavailable', matchId: 'match-1', reason: 'daily-budget' },
    ]);
  });

  it('trips the breaker for the whole day on HTTP 429', async () => {
    const { handler, repository, published } = setup(new QuotaProvider());
    await handler.handle(turnEvent(answerAll));

    expect(published()).toEqual([
      { type: 'ai.unavailable', matchId: 'match-1', reason: 'provider-quota' },
    ]);
    expect((await repository.getDaily(usageDay(new Date()))).trippedAt).not.toBeNull();
  });

  it('skips the call entirely when the AI decides to stay quiet', async () => {
    const provider = new RecordingProvider();
    const { handler, bus } = setup(provider);
    const quiet = turnEvent({
      aiSeats: [aiSeat({ lastMessageAt: new Date().toISOString() })],
    });
    await handler.handle(quiet);
    expect(provider.requests).toHaveLength(0);
    expect(bus.published).toHaveLength(0);
  });

  it('flags replies that break character', async () => {
    class Confessing extends LlmProvider {
      readonly name = 'confessing';
      async generate() {
        return { text: 'ok, eu sou uma IA', usage: { inputTokens: 1, outputTokens: 1 } };
      }
    }
    const { handler, published } = setup(new Confessing());
    await handler.handle(turnEvent(answerAll));
    expect(published()[0]).toMatchObject({ type: 'ai.reply', brokeCharacter: true });
  });

  it('uses the master own key without touching the server budget', async () => {
    const { handler, repository, cipher } = setup();
    // A chave do Mestre gera um GeminiProvider; aqui interceptamos o fetch.
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'opa' }] } }],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 2 },
        }),
        { status: 200 },
      ),
    );
    const event = turnEvent({
      ...answerAll,
      aiSeats: [aiSeat({ encryptedApiKey: cipher.encrypt('AIza-master-own-key-123') })],
    });

    await handler.handle(event);

    const [, init] = fetchMock.mock.calls[0];
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'AIza-master-own-key-123',
    );
    expect(repository.calls[0]).toMatchObject({ ownKey: true, provider: 'gemini' });
    expect((await repository.getDaily(usageDay(new Date()))).calls).toBe(0);
    fetchMock.mockRestore();
  });
});
