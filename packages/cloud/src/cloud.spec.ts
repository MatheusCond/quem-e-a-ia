import { AiUnavailableEvent, BusEvent } from '@quem/shared';
import { ApiKeyCipher } from './api-key-cipher';
import { parseBody } from './aws-message-bus';
import { InMemoryMessageBus } from './in-memory-bus';
import { loadSecrets } from './secrets';

const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };
const event: AiUnavailableEvent = { type: 'ai.unavailable', matchId: 'm1', reason: 'daily-budget' };

describe('ApiKeyCipher', () => {
  it('round-trips a key and never exposes it in the ciphertext', () => {
    const cipher = new ApiKeyCipher('test-secret');
    const encrypted = cipher.encrypt('AIza-my-key');
    expect(encrypted).not.toContain('AIza');
    expect(cipher.decrypt(encrypted)).toBe('AIza-my-key');
  });

  it('rejects ciphertext produced with another secret', () => {
    const encrypted = new ApiKeyCipher('one').encrypt('AIza-my-key');
    expect(() => new ApiKeyCipher('two').decrypt(encrypted)).toThrow();
  });
});

describe('InMemoryMessageBus', () => {
  it('fans out a topic to every subscribed queue', async () => {
    const bus = new InMemoryMessageBus();
    const ranking: BusEvent[] = [];
    const stats: BusEvent[] = [];
    bus.subscribe('match-ranking', async (e) => void ranking.push(e));
    bus.subscribe('match-stats', async (e) => void stats.push(e));
    bus.start();

    await bus.publish('match-events', event);
    await bus.drain();

    expect(ranking).toEqual([event]);
    expect(stats).toEqual([event]);
  });

  it('does not deliver to queues of other topics', async () => {
    const bus = new InMemoryMessageBus();
    const received: BusEvent[] = [];
    bus.subscribe('ai-turns', async (e) => void received.push(e));
    bus.start();

    await bus.publish('match-events', event);
    await bus.drain();

    expect(received).toEqual([]);
  });
});

describe('parseBody', () => {
  it('accepts raw delivery and SNS envelopes', () => {
    expect(parseBody(JSON.stringify(event))).toEqual(event);
    const envelope = { Type: 'Notification', Message: JSON.stringify(event) };
    expect(parseBody(JSON.stringify(envelope))).toEqual(event);
  });
});

describe('loadSecrets', () => {
  it('falls back to environment variables when no secret id is configured', async () => {
    const secrets = await loadSecrets({
      secretId: undefined,
      keys: ['JWT_SECRET', 'GEMINI_API_KEY'],
      connection: { region: 'us-east-1' },
      logger: silentLogger,
      env: { JWT_SECRET: 'from-env' },
    });
    expect(secrets).toEqual({ JWT_SECRET: 'from-env' });
  });
});
