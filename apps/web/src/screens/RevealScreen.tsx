import { NO_AI_VOTE, type PlayerView, type RevealView } from '@quem/shared';
import { type CSSProperties, useMemo, useState } from 'react';
import { PlayerAvatar, SeatAvatar } from '../components/avatars';
import { MessageBubble } from '../components/MessageBubble';
import { TopBar } from '../components/TopBar';
import { Button, ErrorText, SrOnly } from '../components/ui';
import type { Game } from '../lib/useGame';

const rise = (seconds: number) => ({ '--rise-delay': `${seconds}s` }) as CSSProperties;

/** O fim da partida: quem era a IA, quem era o Mestre, o prompt e os pontos. */
export function RevealScreen({ game, onOpenLobby }: { game: Game; onOpenLobby: () => void }) {
  const room = game.room!;
  const match = room.match!;
  const reveal = match.reveal!;
  const isHost = room.hostPlayerId === room.me.playerId;
  const [showChat, setShowChat] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const seatById = useMemo(() => new Map(reveal.seats.map((s) => [s.seatId, s])), [reveal.seats]);
  const playerById = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const aiSeats = reveal.aiSeatIds.map((id) => seatById.get(id)!);

  async function playAgain() {
    setError('');
    setStarting(true);
    const result = await game.send('match:start');
    setStarting(false);
    if (!result.ok) setError(result.error.message);
  }

  return (
    <>
      <TopBar title="Revelação" subtitle={`Partida ${match.number}`} />
      <div className="relative min-h-0 flex-1 overflow-y-auto pb-8">
        <section className="chat-wall px-4 pt-10 pb-9 text-center" aria-labelledby="resultado">
          {aiSeats.length === 0 ? (
            <>
              <p className="rise text-muted" style={rise(0.1)}>
                E a IA era…
              </p>
              <h2
                id="resultado"
                className="reveal-stamp mt-3 inline-block rounded-xl border-4 border-amber px-4 py-1 font-display text-5xl font-extrabold text-amber"
              >
                Ninguém!
              </h2>
              <p className="rise mt-5 text-muted" style={rise(1.2)}>
                Não tinha IA nenhuma. Todo mundo era gente de verdade.
              </p>
            </>
          ) : (
            <>
              <p className="rise text-muted" style={rise(0.1)}>
                {aiSeats.length > 1 ? 'As IAs eram…' : 'A IA era…'}
              </p>
              <h2 id="resultado" className="sr-only">
                {aiSeats.map((s) => s.pseudonym).join(' e ')}
              </h2>
              <div className="mt-6 flex justify-center gap-10">
                {aiSeats.map((seat) => (
                  <div key={seat.seatId} className="flex flex-col items-center">
                    <span className="reveal-ring rise rounded-full" style={rise(0.3)}>
                      <SeatAvatar avatar={seat.avatar} size={aiSeats.length > 1 ? 76 : 96} />
                    </span>
                    <span
                      className="rise mt-4 font-display text-[26px] leading-tight font-extrabold"
                      style={rise(0.45)}
                    >
                      {seat.pseudonym}
                    </span>
                    <span className="reveal-stamp mt-2 rounded-lg border-[3px] border-amber px-3 font-display text-2xl font-extrabold tracking-wide text-amber">
                      IA
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="space-y-4 px-4 pt-5">
          {reveal.masters.map((master) => (
            <MasterCard
              key={master.playerId}
              master={master}
              player={playerById.get(master.playerId)}
              voters={reveal.votes.filter((v) => v.target !== null).length}
            />
          ))}

          <Scores reveal={reveal} />
          <WhoWasWho reveal={reveal} />

          <section aria-labelledby="replay">
            <Button
              variant="secondary"
              className="w-full"
              aria-expanded={showChat}
              aria-controls="replay-chat"
              onClick={() => setShowChat(!showChat)}
            >
              <span id="replay">
                {showChat ? 'Esconder a conversa' : 'Rever a conversa com a IA grifada'}
              </span>
            </Button>
            {showChat && <Replay game={game} seatById={seatById} />}
          </section>
        </div>
      </div>

      <footer className="border-t border-line bg-night p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onOpenLobby}>
            Ver sala e ranking
          </Button>
          {isHost && (
            <Button className="flex-1" onClick={playAgain} disabled={starting}>
              {starting ? 'Sorteando…' : 'Jogar de novo'}
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}

function MasterCard({
  master,
  player,
  voters,
}: {
  master: RevealView['masters'][number];
  player: PlayerView | undefined;
  voters: number;
}) {
  return (
    <section className="rounded-3xl bg-night p-5" aria-label={`Mestre ${master.nickname}`}>
      <div className="flex items-center gap-3">
        {player && <PlayerAvatar player={player} size={46} />}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">Por trás da IA estava</p>
          <p className="truncate font-display text-xl font-bold">{master.nickname}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block font-display text-3xl leading-none font-extrabold tabular-nums">
            {master.deceived}
            <span className="text-lg text-muted">/{voters}</span>
          </span>
          <span className="text-xs text-muted">enganados</span>
        </p>
      </div>

      <figure className="mt-5">
        <figcaption className="text-sm font-semibold text-muted">O prompt do Mestre</figcaption>
        <blockquote className="relative mt-2 rounded-2xl bg-ink p-4 pl-11 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          <span
            aria-hidden
            className="absolute top-1 left-3 font-display text-5xl leading-none text-amber"
          >
            “
          </span>
          {master.persona}
        </blockquote>
      </figure>
      {master.mirrorSamples.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-semibold">Modo espelho:</span> {master.mirrorSamples.join(' / ')}
        </p>
      )}
      {master.brokeCharacter && (
        <p className="mt-3 rounded-xl bg-rose/10 px-3 py-2 text-sm font-semibold text-rose">
          Alguém fez a IA sair do personagem!
        </p>
      )}
    </section>
  );
}

function Scores({ reveal }: { reveal: RevealView }) {
  const lines = [...reveal.scores].sort((a, b) => b.delta - a.delta);
  return (
    <section className="rounded-3xl bg-night p-5" aria-labelledby="pontos">
      <h2 id="pontos" className="font-display text-xl font-bold">
        Pontos da partida
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {lines.map((line) => (
          <li key={line.playerId} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{line.nickname}</p>
              <p className="text-sm leading-snug text-muted">{line.reasons.join('. ')}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 font-display text-lg font-bold tabular-nums ${
                line.delta > 0
                  ? 'bg-mint/15 text-mint'
                  : line.delta < 0
                    ? 'bg-rose/15 text-rose'
                    : 'bg-raised text-muted'
              }`}
            >
              {line.delta > 0 ? `+${line.delta}` : line.delta}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WhoWasWho({ reveal }: { reveal: RevealView }) {
  const voteFor = (playerId: string) => reveal.votes.find((v) => v.playerId === playerId);
  const pseudonym = (seatId: string | null) =>
    seatId === NO_AI_VOTE
      ? 'ninguém'
      : (reveal.seats.find((s) => s.seatId === seatId)?.pseudonym ?? 'ninguém');

  return (
    <section className="rounded-3xl bg-night p-5" aria-labelledby="quem-era-quem">
      <h2 id="quem-era-quem" className="font-display text-xl font-bold">
        Quem era quem
      </h2>
      <ul className="mt-3 space-y-3">
        {reveal.seats.map((seat) => {
          const vote = voteFor(seat.playerId);
          return (
            <li key={seat.seatId} className="flex items-center gap-3">
              <SeatAvatar avatar={seat.avatar} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">
                  {seat.pseudonym} <span className="text-muted">era</span>{' '}
                  <strong className="font-semibold">{seat.nickname}</strong>
                </p>
                {seat.role === 'master' && (
                  <p className="text-sm font-semibold text-amber">Mestre da IA</p>
                )}
                {vote && (
                  <p className="text-sm text-muted">
                    {vote.target === null ? (
                      'Não votou'
                    ) : (
                      <>
                        Votou em {pseudonym(vote.target)}
                        {vote.locked && ' (travado)'}{' '}
                        <span aria-hidden className={vote.correct ? 'text-mint' : 'text-rose'}>
                          {vote.correct ? '✓' : '✗'}
                        </span>
                        <SrOnly>{vote.correct ? 'acertou' : 'errou'}</SrOnly>
                      </>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A conversa inteira de novo; as falas da IA são grifadas em sequência. */
function Replay({
  game,
  seatById,
}: {
  game: Game;
  seatById: Map<string, RevealView['seats'][number]>;
}) {
  let aiIndex = 0;
  return (
    <div id="replay-chat" className="chat-wall mt-3 rounded-3xl px-3 py-3">
      {game.messages.map((message, index) => {
        const previous = game.messages[index - 1];
        const markerIndex = message.reveal?.isAi ? aiIndex++ : undefined;
        return (
          <MessageBubble
            key={message.id}
            message={message}
            seat={message.seatId ? seatById.get(message.seatId) : undefined}
            mine={false}
            showAuthor={previous?.seatId !== message.seatId || previous?.kind !== 'chat'}
            markerIndex={markerIndex}
          />
        );
      })}
    </div>
  );
}
