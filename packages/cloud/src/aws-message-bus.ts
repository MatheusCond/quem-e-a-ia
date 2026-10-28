import { CreateTopicCommand, PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { BusEvent, QueueName, TopicName } from '@quem/shared';
import { AwsConnection, awsClientConfig } from './aws-connection';
import { BusLogger, EventHandler, MessageBus } from './message-bus';

export interface AwsMessageBusOptions {
  connection: AwsConnection;
  logger: BusLogger;
  /** Long polling do SQS: quanto tempo o Receive espera por mensagens. */
  waitTimeSeconds?: number;
}

/**
 * Publica no SNS e consome do SQS.
 *
 * Os tópicos e filas são criados pelo script do LocalStack (ou pelo IaC em
 * produção). Aqui só resolvemos nome → ARN/URL uma vez e guardamos.
 */
export class AwsMessageBus implements MessageBus {
  private readonly sns: SNSClient;
  private readonly sqs: SQSClient;
  private readonly topicArns = new Map<TopicName, Promise<string>>();
  private readonly pollers: SqsPoller[] = [];

  constructor(private readonly options: AwsMessageBusOptions) {
    const config = awsClientConfig(options.connection);
    this.sns = new SNSClient(config);
    this.sqs = new SQSClient(config);
  }

  async publish(topic: TopicName, event: BusEvent): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: await this.topicArn(topic),
        Message: JSON.stringify(event),
        MessageAttributes: { type: { DataType: 'String', StringValue: event.type } },
      }),
    );
  }

  subscribe(queue: QueueName, handler: EventHandler): void {
    this.pollers.push(
      new SqsPoller(
        this.sqs,
        queue,
        handler,
        this.options.logger,
        this.options.waitTimeSeconds ?? 20,
      ),
    );
  }

  start(): void {
    for (const poller of this.pollers) poller.start();
  }

  async stop(): Promise<void> {
    await Promise.all(this.pollers.map((poller) => poller.stop()));
  }

  private topicArn(topic: TopicName): Promise<string> {
    let arn = this.topicArns.get(topic);
    if (!arn) {
      // CreateTopic é idempotente: se o tópico existe, só devolve o ARN.
      arn = this.sns.send(new CreateTopicCommand({ Name: topic })).then((out) => out.TopicArn!);
      arn.catch(() => this.topicArns.delete(topic));
      this.topicArns.set(topic, arn);
    }
    return arn;
  }
}

/**
 * Loop de leitura de uma fila. Apaga a mensagem só depois que o handler
 * termina sem erro; se der erro, a mensagem volta para a fila depois do
 * visibility timeout e, após algumas tentativas, vai para a DLQ.
 */
class SqsPoller {
  private running = false;
  private loop: Promise<void> | null = null;
  private abort = new AbortController();

  constructor(
    private readonly sqs: SQSClient,
    private readonly queue: QueueName,
    private readonly handler: EventHandler,
    private readonly logger: BusLogger,
    private readonly waitTimeSeconds: number,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort.abort();
    await this.loop;
  }

  private async run(): Promise<void> {
    let queueUrl: string | null = null;
    while (this.running) {
      try {
        queueUrl ??= await this.resolveQueueUrl();
        const { Messages = [] } = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: this.waitTimeSeconds,
          }),
          { abortSignal: this.abort.signal },
        );
        await Promise.all(Messages.map((message) => this.handle(queueUrl!, message)));
      } catch (error) {
        if (!this.running) break;
        this.logger.warn(`Falha ao ler a fila ${this.queue}: ${(error as Error).message}`);
        await sleep(2000);
      }
    }
  }

  private async resolveQueueUrl(): Promise<string> {
    const { QueueUrl } = await this.sqs.send(new GetQueueUrlCommand({ QueueName: this.queue }));
    this.logger.log(`Consumindo a fila ${this.queue}`);
    return QueueUrl!;
  }

  private async handle(queueUrl: string, message: Message): Promise<void> {
    try {
      await this.handler(parseBody(message.Body ?? ''));
      await this.sqs.send(
        new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }),
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Erro ao processar mensagem da fila ${this.queue}: ${err.message}`,
        err.stack,
      );
    }
  }
}

/**
 * Com "raw message delivery" o corpo já é o evento. Sem ele, o SNS embrulha
 * o evento num envelope com o campo Message. Aceitamos os dois formatos.
 */
export function parseBody(body: string): BusEvent {
  const parsed = JSON.parse(body) as BusEvent | { Type: string; Message: string };
  if ('Type' in parsed && parsed.Type === 'Notification') {
    return JSON.parse(parsed.Message) as BusEvent;
  }
  return parsed as BusEvent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
