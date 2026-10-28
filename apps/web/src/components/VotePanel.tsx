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
      <p className="py-1 text-center text-sm text-muted">
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

  const option = (selected: boolean) =>
    `flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed ${
      selected
        ? 'border-amber bg-amber/15 font-semibold text-text'
        : 'border-line bg-ink enabled:hover:border-muted'
    }`;

  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="voto" className="font-display text-lg font-bold">
          Quem é a IA?
        </h2>
        <span className="text-sm text-muted tabular-nums" aria-live="polite">
          {progress}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="voto">
        {candidates.map((seat) => {
          const selected = mine?.target === seat.seatId;
          return (
            <button
              key={seat.seatId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={mine?.locked}
              onClick={() => vote(seat.seatId)}
              className={option(selected)}
            >
              <SeatAvatar avatar={seat.avatar} size={30} />
              <span className="min-w-0 truncate">{seat.pseudonym}</span>
            </button>
          );
        })}
        {settings.secretAiCount && (
          <button
            type="button"
            role="radio"
            aria-checked={mine?.target === NO_AI_VOTE}
            disabled={mine?.locked}
            onClick={() => vote(NO_AI_VOTE)}
            className={`col-span-2 justify-center ${option(mine?.target === NO_AI_VOTE)}`}
          >
            Não tem IA nenhuma
          </button>
        )}
      </div>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      {settings.voteLock && mine && !mine.locked && (
        <Button variant="amber" className="mt-2 w-full" onClick={lock}>
          Travar voto (quanto antes, mais pontos)
        </Button>
      )}
      {mine?.locked && (
        <p className="mt-2 text-center text-sm font-semibold text-amber">
          Voto travado. Agora é com os outros.
        </p>
      )}
    </div>
  );
}
