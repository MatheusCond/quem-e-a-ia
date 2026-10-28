/**
 * Teste de carga: várias salas jogando partidas completas ao mesmo tempo,
 * com jogadores robôs conectados pelo mesmo WebSocket do navegador.
 *
 *   npm run load-test                       # 10 salas x 4 jogadores
 *   ROOMS=30 PLAYERS=5 npm run load-test
 *
 * Mede:
 *   - ack: tempo entre enviar a mensagem e o servidor confirmar;
 *   - entrega: tempo até a mensagem chegar no navegador de OUTRO jogador
 *     (inclui banco, timer de entrega e broadcast do Socket.IO);
 *   - respostas da IA recebidas (caminho SNS → SQS → worker → SQS → API).
 *
 * As salas usam "digitando" e limites desligados, para medir o servidor e
 * não os atrasos de propósito do jogo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AckResult,
  ClientToServerEvents,
  GAME_NAMESPACE,
  RoomStateView,
  ServerToClientEvents,
} from '@quem/shared';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ROOMS = Number(process.env.ROOMS ?? 10);
const PLAYERS = Number(process.env.PLAYERS ?? 4);
const MESSAGES_PER_PLAYER = Number(process.env.MESSAGES ?? 6);
const CONVERSATION_SECONDS = Number(process.env.CONVERSATION_SECONDS ?? 30);

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Bot {
  name: string;
  playerId: string;
  socket: BotSocket;
  state: RoomStateView | null;
}

const metrics = {
  ackMs: [] as number[],
  deliveryMs: [] as number[],
  aiReplies: 0,
  matchesFinished: 0,
  errors: [] as string[],
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function connect(name: string, joined: { playerId: string; token: string }): Promise<Bot> {
  const socket: BotSocket = io(`${API_URL}${GAME_NAMESPACE}`, {
    auth: { token: joined.token },
    transports: ['websocket'],
    forceNew: true,
  });
  const bot: Bot = { name, playerId: joined.playerId, socket, state: null };
  socket.on('room:state', (state) => (bot.state = state));
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(bot));
    socket.once('connect_error', reject);
  });
}

function emit(bot: Bot, event: keyof ClientToServerEvents, ...args: unknown[]): Promise<AckResult> {
  return new Promise((resolve) => {
    (bot.socket.emit as (...a: unknown[]) => void)(event, ...args, resolve);
  });
}

function waitFor(bot: Bot, check: (state: RoomStateView) => boolean, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (bot.state && check(bot.state)) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`${bot.name}: tempo esgotado (fase ${bot.state?.match?.phase})`));
      }
    }, 50);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function playRoom(index: number): Promise<void> {
  const host = await post<{ roomCode: string; playerId: string; token: string }>('/rooms', {
    nickname: `Robo ${index}-0`,
  });
  const joined = [host];
  for (let i = 1; i < PLAYERS; i++) {
    joined.push(await post(`/rooms/${host.roomCode}/players`, { nickname: `Robo ${index}-${i}` }));
  }
  const bots = await Promise.all(joined.map((j, i) => connect(`sala${index}-bot${i}`, j)));

  try {
    // Mede quanto tempo cada mensagem leva para aparecer no navegador do vizinho.
    const sentAt = new Map<string, number>();
    const ownTexts = new Set<string>();
    const observer = bots[bots.length - 1];
    observer.socket.on('chat:message', (message) => {
      const started = sentAt.get(message.text);
      if (started) metrics.deliveryMs.push(Date.now() - started);
      else if (message.kind === 'chat' && !ownTexts.has(message.text)) metrics.aiReplies++;
    });

    await waitFor(bots[0], (s) => s.players.filter((p) => p.connected).length === PLAYERS, 10_000);
    await emit(bots[0], 'room:settings', {
      creationSeconds: 10,
      conversationSeconds: CONVERSATION_SECONDS,
      votingSeconds: 10,
      typingAndDelay: false,
      messageLimits: false,
      topicAndFlash: false,
      selectiveReplies: true,
    });
    const started = await emit(bots[0], 'match:start');
    if (!started.ok) throw new Error(`match:start: ${started.error.message}`);
    await Promise.all(bots.map((b) => waitFor(b, (s) => s.match?.phase === 'creation', 10_000)));

    const master = bots.find((b) => b.state!.match!.role === 'master')!;
    const humans = bots.filter((b) => b !== master);
    await emit(master, 'creation:submit', {
      persona: 'Robô de teste: responde curto, em minúsculas, e gosta de futebol.',
    });
    await Promise.all(
      bots.map((b) => waitFor(b, (s) => s.match?.phase === 'conversation', 15_000)),
    );

    const window = (CONVERSATION_SECONDS * 1000 * 0.7) / MESSAGES_PER_PLAYER;
    await Promise.all(
      humans.map(async (bot, b) => {
        for (let m = 0; m < MESSAGES_PER_PLAYER; m++) {
          await sleep(window * Math.random());
          const text = `msg ${index}-${b}-${m} alguem ai?`;
          const t0 = Date.now();
          if (bot === observer) ownTexts.add(text);
          else sentAt.set(text, t0);
          const ack = await emit(bot, 'chat:send', { text });
          metrics.ackMs.push(Date.now() - t0);
          if (!ack.ok) metrics.errors.push(`chat:send ${ack.error.code}`);
        }
      }),
    );

    await Promise.all(
      bots.map((b) =>
        waitFor(b, (s) => s.match?.phase === 'voting', CONVERSATION_SECONDS * 1000 + 15_000),
      ),
    );
    const aiSeat = master.state!.match!.master!.aiSeatId;
    await Promise.all(
      humans.map((bot) => {
        const others = bot.state!.match!.seats.filter(
          (s) => s.seatId !== bot.state!.match!.mySeatId,
        );
        const target = Math.random() < 0.5 ? aiSeat : others[0].seatId;
        return emit(bot, 'vote:cast', { target });
      }),
    );
    await Promise.all(bots.map((b) => waitFor(b, (s) => s.match?.phase === 'reveal', 20_000)));
    metrics.matchesFinished++;
  } finally {
    bots.forEach((b) => b.socket.close());
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  console.log(`Teste de carga: ${ROOMS} salas x ${PLAYERS} jogadores em ${API_URL}`);
  const t0 = Date.now();
  const results = await Promise.allSettled(Array.from({ length: ROOMS }, (_, i) => playRoom(i)));
  results.forEach((r) => {
    if (r.status === 'rejected') metrics.errors.push(String(r.reason?.message ?? r.reason));
  });

  const summary = {
    date: new Date().toISOString(),
    rooms: ROOMS,
    playersPerRoom: PLAYERS,
    concurrentSockets: ROOMS * PLAYERS,
    durationSeconds: Math.round((Date.now() - t0) / 1000),
    matchesFinished: metrics.matchesFinished,
    humanMessages: metrics.ackMs.length,
    aiRepliesReceived: metrics.aiReplies,
    ackMs: stats(metrics.ackMs),
    deliveryMs: stats(metrics.deliveryMs),
    errors: metrics.errors,
  };
  console.log(JSON.stringify(summary, null, 2));

  const dir = join(__dirname, '..', 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${summary.date.replace(/[:.]/g, '-')}.json`),
    JSON.stringify(summary, null, 2),
  );
  process.exit(metrics.errors.length ? 1 : 0);
}

function stats(values: number[]) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Math.max(...values) : 0,
  };
}

void main();
