import { useEffect, useState } from 'react';
import { useGame } from '../lib/useGame';
import { ChatPhase } from './ChatPhase';
import { CreationPhase } from './CreationPhase';
import { Lobby } from './Lobby';
import { RevealScreen } from './RevealScreen';

/** Escolhe a tela de acordo com a fase que o servidor mandou. */
export function RoomScreen({
  code,
  token,
  onRejected,
}: {
  code: string;
  token: string;
  onRejected: (reason: string) => void;
}) {
  const game = useGame(token);
  const matchId = game.room?.match?.id;
  const [lobbyAfterMatch, setLobbyAfterMatch] = useState<string | null>(null);

  useEffect(() => {
    if (game.status === 'rejected') {
      onRejected(game.rejection ?? 'Sua sessão nesta sala expirou. Entre de novo.');
    }
  }, [game.status, game.rejection, onRejected]);

  if (!game.room) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted">
        Entrando na sala {code}…
      </div>
    );
  }

  const match = game.room.match;
  let screen;
  if (!match || (match.phase === 'reveal' && lobbyAfterMatch === matchId)) {
    screen = <Lobby game={game} />;
  } else if (match.phase === 'creation') {
    screen = <CreationPhase game={game} />;
  } else if (match.phase === 'reveal') {
    screen = <RevealScreen game={game} onOpenLobby={() => setLobbyAfterMatch(match.id)} />;
  } else {
    screen = <ChatPhase game={game} />;
  }

  return (
    // relative + overflow-clip: elementos com position absolute (como os textos sr-only)
    // ficam presos ao app, e nem um scrollIntoView consegue rolar o documento e
    // esconder o cabeçalho. Cada área rolável interna também é relative.
    <div className="relative mx-auto flex h-dvh max-w-lg flex-col overflow-clip bg-ink sm:border-x sm:border-line">
      {game.status !== 'online' && (
        <div
          role="status"
          className="bg-amber px-4 py-1.5 text-center text-sm font-semibold text-ink"
        >
          Conexão caiu. Reconectando…
        </div>
      )}
      {screen}
      {game.notice && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-16 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-raised px-4 py-2 text-center text-sm shadow-lg"
        >
          {game.notice.kind === 'flash' ? `⚡ ${game.notice.text}` : game.notice.text}
        </div>
      )}
    </div>
  );
}
