import { NO_AI_VOTE, type RevealView } from '@quem/shared';
import { useMemo, useState } from 'react';
import { PlayerAvatar, SeatAvatar } from '../components/avatars';
import { MessageBubble } from '../components/MessageBubble';
import { TopBar } from '../components/TopBar';
import { Button, ErrorText } from '../components/ui';
import type { Game } from '../lib/useGame';

/** O fim da partida: quem era a IA, quem era o Mestre, o prompt e os pontos. */
export function RevealScreen({ game, onOpenLobby }: { game: Game; onOpenLobby: () => void }) {
  const room = game.room!;
  const match = room.match!;
  const reveal = match.reveal!;
  const isHost = room.hostPlayerId === room.me.playerId;
  const [showChat, setShowChat] = useState(false);
  const [error, setError] = useState('');
  const seatById = useMemo(() => new Map(reveal.seats.map((s) => [s.seatId, s])), [reveal.seats]);
  const aiSeats = reveal.aiSeatIds.map((id) => seatById.get(id)!);
  const playerById = new Map(room.players.map((p) => [p.id, p]));

  async function playAgain() {
    setError('');
    const result = await game.send('match:start');
    if (!result.ok) setError(result.error.message);
  }

  return (
    <>
      <TopBar title="Revelação" subtitle={`Partida ${match.number}`} />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <section className="pt-8 pb-6 text-center">
          {aiSeats.length === 0 ? (
            <>
              <p className="text-muted">E a IA era...</p>
              <h2 className="reveal-stamp mt-2 font-display text-4xl font-extrabold text-amber">
                Ninguém!
              </h2>
              <p className="mt-2 text-muted">
                Não tinha IA nenhuma. Todo mundo era gente de verdade.
              </p>
            </>
          ) : (
            <>
              <p className="text-muted">{aiSeats.length > 1 ? 'As IAs eram...' : 'A IA era...'}</p>
              <div className="mt-4 flex justify-center gap-6">
                {aiSeats.map((seat) => (
                  <div key={seat.seatId} className="flex flex-col items-center">
                    <span className="reveal-glow rounded-full">
                      <SeatAvatar avatar={seat.avatar} size={84} />
                    </span>
                    <span className="mt-2 font-display text-2xl font-extrabold">
                      {seat.pseudonym}
                    </span>
                    <span className="reveal-stamp mt-1 rounded-md border-2 border-amber px-2 font-display text-lg font-extrabold text-amber">
                      IA
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {reveal.masters.map((master) => (
          <section key={master.playerId} className="mb-4 rounded-2xl bg-night p-4">
            <div className="flex items-center gap-3">
              {playerById.get(master.playerId) && (
                <PlayerAvatar player={playerById.get(master.playerId)!} size={44} />
              )}
              <div>
                <p className="text-sm text-muted">Mestre da IA</p>
                <p className="font-display text-xl font-bold">{master.nickname}</p>
              </div>
              <p className="ml-auto text-right text-sm text-muted">
                enganou
                <br />
                <strong className="text-lg text-text">{master.deceived}</strong>
              </p>
            </div>
            <blockquote className="mt-3 border-l-2 border-amber pl-3 text-[15px] whitespace-pre-wrap text-text/90">
              {master.persona}
            </blockquote>
            {master.mirrorSamples.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                Modo espelho: {master.mirrorSamples.join(' / ')}
              </p>
            )}
            {master.brokeCharacter && (
              <p className="mt-2 text-sm font-semibold text-rose">
                Alguém fez a IA sair do personagem!
              </p>
            )}
          </section>
        ))}

        <Scores reveal={reveal} />
        <WhoWasWho reveal={reveal} />

        <Button variant="secondary" className="mt-6 w-full" onClick={() => setShowChat(!showChat)}>
          {showChat ? 'Esconder conversa' : 'Rever a conversa com a IA marcada'}
        </Button>
        {showChat && (
          <div className="chat-wall mt-3 rounded-2xl p-3">
            {game.messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                seat={message.seatId ? seatById.get(message.seatId) : undefined}
                mine={false}
                showAuthor={game.messages[index - 1]?.seatId !== message.seatId}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="flex gap-2 border-t border-line bg-night p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" className="flex-1" onClick={onOpenLobby}>
          Ver sala e ranking
        </Button>
        {isHost && (
          <Button className="flex-1" onClick={playAgain}>
            Jogar de novo
          </Button>
        )}
        <ErrorText>{error}</ErrorText>
      </footer>
    </>
  );
}

function Scores({ reveal }: { reveal: RevealView }) {
  const lines = [...reveal.scores].sort((a, b) => b.delta - a.delta);
  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-bold">Pontos da partida</h2>
      <ul className="mt-2 divide-y divide-line">
        {lines.map((line) => (
          <li key={line.playerId} className="py-2.5">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{line.nickname}</span>
              <span
                className={`font-display text-lg font-bold tabular-nums ${line.delta > 0 ? 'text-mint' : line.delta < 0 ? 'text-rose' : 'text-muted'}`}
              >
                {line.delta > 0 ? `+${line.delta}` : line.delta}
              </span>
            </div>
            <p className="text-sm text-muted">{line.reasons.join('. ')}</p>
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
      : (reveal.seats.find((s) => s.seatId === seatId)?.pseudonym ?? 'não votou');

  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-bold">Quem era quem</h2>
      <ul className="mt-2 space-y-2">
        {reveal.seats.map((seat) => {
          const vote = voteFor(seat.playerId);
          return (
            <li key={seat.seatId} className="flex items-center gap-3">
              <SeatAvatar avatar={seat.avatar} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px]">
                  {seat.pseudonym} <span className="text-muted">era</span> {seat.nickname}
                  {seat.role === 'master' && <span className="text-amber"> (Mestre)</span>}
                </div>
                {vote && (
                  <div className="text-sm text-muted">
                    votou em {pseudonym(vote.target)}
                    {vote.locked && ', travado'}
                    {vote.target && (vote.correct ? ' ✓' : ' ✗')}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
