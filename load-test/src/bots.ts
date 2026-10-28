/**
 * Robôs para testar o jogo sozinho: entram numa sala que já existe,
 * conversam durante a partida e votam.
 *
 *   ROOM=K7QX2M npm run bots -w @quem/load-test
 *   ROOM=K7QX2M BOTS=3 npm run bots -w @quem/load-test
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
const ROOM = (process.env.ROOM ?? '').toUpperCase();
const BOTS = Number(process.env.BOTS ?? 2);

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

async function startBot(name: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/rooms/${ROOM}/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: name }),
  });
  if (!res.ok) throw new Error(`${name}: ${await res.text()}`);
  const { token } = (await res.json()) as { token: string };

  const socket: BotSocket = io(`${API_URL}${GAME_NAMESPACE}`, {
    auth: { token },
    transports: ['websocket'],
  });
  const emit = (event: keyof ClientToServerEvents, ...args: unknown[]) =>
    (socket.emit as (...a: unknown[]) => void)(event, ...args, () => undefined);

  let chatTimer: NodeJS.Timeout | null = null;
  let lastPhase: string | undefined;

  socket.on('room:state', (state: RoomStateView) => {
    const match = state.match;
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
  if (!ROOM) {
    console.error('Informe a sala: ROOM=CODIGO npm run bots -w @quem/load-test');
    process.exit(1);
  }
  await Promise.all(NAMES.slice(0, BOTS).map(startBot));
  console.log(`${BOTS} robô(s) na sala ${ROOM}. Ctrl+C para sair.`);
}

void main();
