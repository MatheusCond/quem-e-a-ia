import { BusEvent, QueueName, TopicName } from '@quem/shared';

export type EventHandler = (event: BusEvent) => Promise<void>;

/**
 * Porta de mensageria usada pela api e pelo worker.
 *
 * Em produção (e no docker compose) a implementação é SNS + SQS. Nos testes
 * é um barramento em memória com o mesmo mapa de assinaturas, então o código
 * de negócio não sabe qual dos dois está rodando.
 */
export interface MessageBus {
  publish(topic: TopicName, event: BusEvent): Promise<void>;
  /** Registra quem trata as mensagens de uma fila. Chame antes de start(). */
  subscribe(queue: QueueName, handler: EventHandler): void;
  start(): void;
  stop(): Promise<void>;
}

/** Interface mínima de log, compatível com o Logger do NestJS e com console. */
export interface BusLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string, trace?: string): void;
}
