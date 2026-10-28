import { MikroORM } from '@mikro-orm/postgresql';
import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { InMemoryMessageBus } from '@quem/cloud';
import {
  AckResult,
  ChatMessageView,
  ClientToServerEvents,
  GAME_NAMESPACE,
  RoomStateView,
  ServerToClientEvents,
} from '@quem/shared';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CONFIG, AppConfig } from '../src/config/app-config';
import { configureApp } from '../src/configure-app';
import { MESSAGE_BUS } from '../src/infrastructure/infrastructure.module';
import { InMemoryObjectStorage, ObjectStorage } from '../src/infrastructure/storage/object-storage';
import { RANDOM, seededRandom } from '../src/shared/random';

export interface TestContext {
  app: INestApplication;
  bus: InMemoryMessageBus;
  storage: InMemoryObjectStorage;
  url: string;
  close(): Promise<void>;
}

/**
 * Sobe a API completa, igual à produção, trocando só a fila (SNS/SQS) e o S3
 * por versões em memória. O banco é um Postgres de verdade, recriado pelas
 * migrações a cada arquivo de teste.
 */
export async function createTestApp(): Promise<TestContext> {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgresql://quem:quem@localhost:5432/quem_e_a_ia_test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.BYOK_ENCRYPTION_KEY = 'test-byok-secret';
  process.env.RATE_LIMIT_PER_MINUTE = '1000';
  delete process.env.SECRETS_ID;

  const bus = new InMemoryMessageBus();
  const storage = new InMemoryObjectStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MESSAGE_BUS)
    .useValue(bus)
    .overrideProvider(ObjectStorage)
    .useValue(storage)
    .overrideProvider(RANDOM)
    .useValue(seededRandom(42))
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  const orm = app.get(MikroORM);
  await orm.schema.ensureDatabase();
  await orm.schema.dropSchema({ dropMigrationsTable: true });
  await orm.getMigrator().up();

  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };

  return {
    app,
    bus,
    storage,
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      // Deixa os últimos eventos de desconexão terminarem antes de fechar o banco.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await app.close();
    },
  };
}

export interface Joined {
  roomCode: string;
  playerId: string;
  token: string;
}

export async function createRoom(ctx: TestContext, nickname: string): Promise<Joined> {
  const res = await request(ctx.url).post('/api/rooms').send({ nickname }).expect(201);
  return res.body as Joined;
}

export async function joinRoom(ctx: TestContext, code: string, nickname: string): Promise<Joined> {
  const res = await request(ctx.url)
    .post(`/api/rooms/${code}/players`)
    .send({ nickname })
    .expect(201);
  return res.body as Joined;
}

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Um jogador conectado no WebSocket, guardando o último estado e o chat,
 * com helpers para esperar algo acontecer.
 */
export class PlayerClient {
  state: RoomStateView | null = null;
  messages: ChatMessageView[] = [];
  readonly drafts: Array<{ draftId: string; text: string }> = [];
  private readonly listeners = new Set<() => void>();

  private constructor(
    readonly socket: ClientSocket,
    readonly joined: Joined,
  ) {
    socket.on('room:state', (state) => this.update(() => (this.state = state)));
    socket.on('chat:history', (messages) => this.update(() => (this.messages = messages)));
    socket.on('chat:message', (message) => this.update(() => this.messages.push(message)));
    socket.on('master:draft', (draft) => this.update(() => this.drafts.push(draft)));
  }

  static connect(ctx: TestContext, joined: Joined): Promise<PlayerClient> {
    const socket: ClientSocket = io(`${ctx.url}${GAME_NAMESPACE}`, {
      auth: { token: joined.token },
      transports: ['websocket'],
      forceNew: true,
    });
    const client = new PlayerClient(socket, joined);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(client));
      socket.once('connect_error', reject);
    });
  }

  get playerId() {
    return this.joined.playerId;
  }

  get match() {
    return this.state?.match ?? null;
  }

  /** Emite um evento e devolve o ack do servidor. */
  emit<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]> extends [...infer P, unknown] ? P : never
  ): Promise<AckResult> {
    return new Promise((resolve) => {
      (this.socket.emit as (...a: unknown[]) => void)(event, ...args, resolve);
    });
  }

  /** Espera até a condição ficar verdadeira (checada a cada evento recebido). */
  waitFor(condition: (client: PlayerClient) => boolean, label = 'condição', timeoutMs = 8000) {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        if (!condition(this)) return;
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Tempo esgotado esperando: ${label}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
  }

  close() {
    this.socket.close();
  }

  private update(change: () => void) {
    change();
    for (const listener of [...this.listeners]) listener();
  }
}
