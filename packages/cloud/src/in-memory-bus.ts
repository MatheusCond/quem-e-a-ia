import { BusEvent, QueueName, SUBSCRIPTIONS, TopicName } from '@quem/shared';
import { EventHandler, MessageBus } from './message-bus';

/**
 * Barramento em memória para testes. Entrega cada evento, de forma
 * assíncrona, para as filas que assinam o tópico, igual ao SNS faria.
 */
export class InMemoryMessageBus implements MessageBus {
  private readonly handlers = new Map<QueueName, EventHandler[]>();
  private readonly pending = new Set<Promise<void>>();
  private running = false;
  /** Tudo que foi publicado, útil para asserções nos testes. */
  readonly published: Array<{ topic: TopicName; event: BusEvent }> = [];

  async publish(topic: TopicName, event: BusEvent): Promise<void> {
    this.published.push({ topic, event });
    if (!this.running) return;
    for (const queue of SUBSCRIPTIONS[topic]) {
      for (const handler of this.handlers.get(queue) ?? []) {
        const delivery = new Promise<void>((resolve) => setImmediate(resolve))
          .then(() => handler(structuredClone(event)))
          .catch((error: unknown) => console.error(`[in-memory-bus] ${queue}:`, error))
          .finally(() => this.pending.delete(delivery));
        this.pending.add(delivery);
      }
    }
  }

  subscribe(queue: QueueName, handler: EventHandler): void {
    this.handlers.set(queue, [...(this.handlers.get(queue) ?? []), handler]);
  }

  start(): void {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.drain();
  }

  /** Espera todas as entregas em andamento terminarem. */
  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }
}
