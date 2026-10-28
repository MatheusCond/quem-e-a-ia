import { NO_AI_VOTE } from '@quem/shared';
import { useState } from 'react';
import type { Game } from '../lib/useGame';
import { SeatAvatar } from './avatars';
import { Button, ErrorText } from './ui';

/** Escolher (e, se a sala permitir, travar) o voto em quem é a IA. */
export function VotePanel({ game }: { game: Game }) {
  const { settings } = game.room!;
  const match = game.room!.match!;
  const mine = match.votes.mine;
  const [error, setError] = useState('');
  const candidates = match.seats.filter((s) => s.seatId !== match.mySeatId);

  async function vote(target: string) {
    setError('');
    const result = await game.send('vote:cast', { target });
    if (!result.ok) setError(result.error.message);
  }

  async function lock() {
    setError('');
    const result = await game.send('vote:lock');
    if (!result.ok) setError(result.error.message);
  }

  if (!match.canVote) {
    return (
      <p className="text-center text-sm text-muted">
        {match.role === 'master'
          ? 'O Mestre não vota. Torça para ninguém achar a sua IA.'
          : 'Você está assistindo esta partida.'}
      </p>
    );
  }

  const progress =
    match.votes.eligible === null
      ? `${match.votes.voted} já votaram`
      : `${match.votes.voted} de ${match.votes.eligible} votaram`;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">Quem é a IA?</h2>
        <span className="text-sm text-muted">{progress}</span>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Seu voto">
        {candidates.map((seat) => (
          <button
            key={seat.seatId}
            type="button"
            role="radio"
            aria-checked={mine?.target === seat.seatId}
            disabled={mine?.locked}
            onClick={() => vote(seat.seatId)}
            className={`flex items-center gap-2 rounded-xl border px-2 py-2 text-left text-sm ${mine?.target === seat.seatId ? 'border-amber bg-amber/10' : 'border-line bg-ink'}`}
          >
            <SeatAvatar avatar={seat.avatar} size={28} />
            <span className="truncate">{seat.pseudonym}</span>
          </button>
        ))}
        {settings.secretAiCount && (
          <button
            type="button"
            role="radio"
            aria-checked={mine?.target === NO_AI_VOTE}
            disabled={mine?.locked}
            onClick={() => vote(NO_AI_VOTE)}
            className={`col-span-2 rounded-xl border px-3 py-2 text-sm ${mine?.target === NO_AI_VOTE ? 'border-amber bg-amber/10' : 'border-line bg-ink'}`}
          >
            Não tem IA nenhuma
          </button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
      {settings.voteLock && mine && !mine.locked && (
        <Button variant="amber" className="mt-3 w-full" onClick={lock}>
          Travar voto (quanto antes, mais pontos)
        </Button>
      )}
      {mine?.locked && <p className="mt-3 text-center text-sm text-amber">Voto travado.</p>}
    </div>
  );
}
