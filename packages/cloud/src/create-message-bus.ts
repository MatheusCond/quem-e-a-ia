import { AwsMessageBus, AwsMessageBusOptions } from './aws-message-bus';
import { InMemoryMessageBus } from './in-memory-bus';
import { MessageBus } from './message-bus';

/**
 * "aws": SNS + SQS (docker compose com LocalStack, ou AWS de verdade).
 * "memory": API e worker no mesmo processo, sem fila externa.
 */
export type MessageBusDriver = 'aws' | 'memory';

export function messageBusDriverFromEnv(env: NodeJS.ProcessEnv = process.env): MessageBusDriver {
  return env.MESSAGE_BUS === 'memory' ? 'memory' : 'aws';
}

let processBus: InMemoryMessageBus | undefined;

/**
 * Monta o barramento escolhido. No driver "memory" a API e o worker recebem
 * a mesma instância, por isso os dois precisam rodar no mesmo processo
 * (modo processo único, usado na hospedagem gratuita).
 */
export function createMessageBus(
  driver: MessageBusDriver,
  options: AwsMessageBusOptions,
): MessageBus {
  if (driver === 'aws') return new AwsMessageBus(options);
  processBus ??= new InMemoryMessageBus({ keepHistory: false });
  return processBus;
}
