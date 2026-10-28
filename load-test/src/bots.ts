/**
 * Robôs para jogar sozinho, testar ou demonstrar o jogo.
 *
 * Entrar numa sala que já existe:
 *   ROOM=K7QX2M npm run bots -w @quem/load-test
 *
 * Criar uma sala de demonstração (um robô é o anfitrião). Os robôs
 * começam a partida sozinhos quando mais alguém entra pelo link:
 *   npm run bots -w @quem/load-test
 *   BOTS=3 CONVERSATION_SECONDS=60 npm run bots -w @quem/load-test
 *
 * Se um robô for sorteado Mestre, ele escreve uma personalidade simples.
 */
import {
  ClientToServerEvents,
  GAME_NAMESPACE,
  RoomStateView,
  ServerToClientEvents,
} from '@quem/shared';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:8080';
const BOTS = Number(process.env.BOTS ?? 3);
const CONVERSATION_SECONDS = Number(process.env.CONVERSATION_SECONDS ?? 60);

const NAMES = ['Robozinho', 'Bip', 'Clank', 'Zezé', 'Tobias'];
const LINES = [
  'oi gente',
  'quem ai ta com fome?',
  'kkkk',
  'eu acho que sei quem é a ia',
  'serio, ninguem vai falar nada?',
  'eu prefiro pizza',
  'vcs viram o jogo ontem?',
  'to desconfiado de alguem aqui',
  'nossa q silencio',
];

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

function startBot(name: string, token: string, isHost: boolean): void {
  const socket: BotSocket = io(`${API_URL}${GAME_NAMESPACE}`, {
    auth: { token },
    transports: ['websocket'],
  });
  const emit = (event: keyof ClientToServerEvents, ...args: unknown[]) =>
    (socket.emit as (...a: unknown[]) => void)(event, ...args, () => undefined);

  let chatTimer: NodeJS.Timeout | null = null;
  let lastPhase: string | undefined;
  let configured = false;

  socket.on('room:state', (state: RoomStateView) => {
    const match = state.match;

    if (isHost && !configured) {
      configured = true;
      emit('room:settings', {
        creationSeconds: 30,
        conversationSeconds: CONVERSATION_SECONDS,
        votingSeconds: 30,
      });
    }
    // Anfitrião robô: começa quando entra alguém além dos robôs.
    const online = state.players.filter((p) => p.connected).length;
    if (isHost && !match && online > BOTS) {
      setTimeout(() => emit('match:start'), 2000);
    }

    if (match?.phase === lastPhase) return;
    lastPhase = match?.phase;
    if (chatTimer) clearInterval(chatTimer);

    if (match?.phase === 'creation' && match.role === 'master') {
      emit('creation:submit', {
        persona: 'Fala tudo em minúsculas, adora futebol e responde curtinho com "kkk".',
      });
    }
    if (match?.phase === 'conversation' && match.role === 'player') {
      chatTimer = setInterval(
        () => emit('chat:send', { text: pick(LINES) }),
        6000 + Math.random() * 6000,
      );
    }
    if (match?.phase === 'voting' && match.canVote) {
      const others = match.seats.filter((s) => s.seatId !== match.mySeatId);
      setTimeout(
        () => emit('vote:cast', { target: pick(others).seatId }),
        2000 + Math.random() * 4000,
      );
    }
    console.log(`${name}: fase ${match?.phase ?? 'lobby'}${match ? ` (${match.role})` : ''}`);
  });
  socket.on('connect_error', (error) => console.error(`${name}: ${error.message}`));
}

async function main() {
  const names = NAMES.slice(0, BOTS);
  let room = (process.env.ROOM ?? '').toUpperCase();
  const createsRoom = !room;

  if (createsRoom) {
    const host = await post<{ roomCode: string; token: string }>('/rooms', { nickname: names[0] });
    room = host.roomCode;
    startBot(names[0], host.token, true);
    names.shift();
  }
  for (const name of names) {
    const joined = await post<{ token: string }>(`/rooms/${room}/players`, { nickname: name });
    startBot(name, joined.token, false);
  }

  console.log(`${BOTS} robô(s) na sala ${room}. Ctrl+C para sair.`);
  if (createsRoom) console.log(`Entre pelo navegador: ${WEB_URL}/sala/${room}`);
}

void main();
