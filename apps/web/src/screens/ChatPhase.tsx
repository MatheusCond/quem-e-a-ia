import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MasterPanel } from '../components/MasterPanel';
import { MessageBubble, TypingBubble } from '../components/MessageBubble';
import { Countdown, TopBar } from '../components/TopBar';
import { Button, ErrorText, Sheet } from '../components/ui';
import { VotePanel } from '../components/VotePanel';
import { formatRemaining, useRemaining } from '../lib/time';
import type { Game } from '../lib/useGame';

const REPORT_REASONS = [
  'Ofensiva ou preconceituosa',
  'Assédio ou ameaça',
  'Conteúdo sexual',
  'Outro motivo',
];

/** O chat em grupo das fases de conversa e votação. */
export function ChatPhase({ game }: { game: Game }) {
  const { settings } = game.room!;
  const match = game.room!.match!;
  const seatById = useMemo(() => new Map(match.seats.map((s) => [s.seatId, s])), [match.seats]);
  const mySeatId = match.mySeatId ?? match.master?.aiSeatId ?? null;
  const conversation = match.phase === 'conversation';
  const [voteOpen, setVoteOpen] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const typingSeats = Object.keys(game.typing)
    .filter((id) => id !== mySeatId)
    .map((id) => seatById.get(id))
    .filter((s) => s !== undefined);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [game.messages.length, typingSeats.length]);

  const subtitle =
    typingSeats.length > 0
      ? `${typingSeats.map((s) => s.pseudonym).join(', ')} digitando...`
      : match.seats.map((s) => s.pseudonym).join(', ');

  return (
    <>
      <TopBar
        title={conversation ? 'Quem é a IA?' : 'Votação'}
        subtitle={subtitle}
        right={
          <div className="flex items-center gap-3">
            {conversation && settings.voteLock && match.canVote && (
              <Button
                variant="amber"
                className="px-3 py-1.5 text-sm"
                onClick={() => setVoteOpen(true)}
              >
                {match.votes.mine?.locked ? 'Voto travado' : 'Votar'}
              </Button>
            )}
            <Countdown
              deadline={match.phaseEndsAt}
              clockOffset={game.clockOffset}
              label={conversation ? 'de conversa' : 'para votar'}
            />
          </div>
        }
      />

      {match.theme && (
        <div className="border-b border-line bg-night px-4 py-2 text-sm">
          <span className="text-muted">Tema: </span>
          {match.theme}
        </div>
      )}
      {match.flash && (
        <FlashBanner question={match.flash.question} endsAt={match.flash.endsAt} game={game} />
      )}
      {match.aiResting && (
        <div className="bg-amber/15 px-4 py-2 text-sm text-amber">
          A IA está descansando, voltem mais tarde. Hora de votar!
        </div>
      )}
      {match.role === 'spectator' && (
        <div className="bg-night px-4 py-2 text-sm text-muted">
          Você está assistindo esta partida e joga a próxima.
        </div>
      )}

      <div ref={listRef} className="chat-wall flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {game.messages.map((message, index) => {
          const previous = game.messages[index - 1];
          const mine = message.seatId !== null && message.seatId === mySeatId;
          const reportable = !mine && message.kind === 'chat';
          return (
            <MessageBubble
              key={message.id}
              message={message}
              seat={message.seatId ? seatById.get(message.seatId) : undefined}
              mine={mine}
              showAuthor={previous?.seatId !== message.seatId || previous?.kind !== 'chat'}
              selected={selected === message.id}
              onSelect={
                reportable
                  ? () => setSelected(selected === message.id ? null : message.id)
                  : undefined
              }
              onReport={() => {
                setSelected(null);
                setReporting(message.id);
              }}
            />
          );
        })}
        {typingSeats.map((seat) => (
          <TypingBubble key={seat.seatId} seat={seat} />
        ))}
      </div>

      <footer className="border-t border-line bg-night p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {match.role === 'master' ? (
          <MasterPanel game={game} />
        ) : conversation && match.role === 'player' ? (
          <Composer game={game} />
        ) : (
          <VotePanel game={game} />
        )}
      </footer>

      <Sheet open={voteOpen} onClose={() => setVoteOpen(false)} title="Votar agora">
        <VotePanel game={game} />
      </Sheet>
      <ReportSheet game={game} messageId={reporting} onClose={() => setReporting(null)} />
    </>
  );
}

function Composer({ game }: { game: Game }) {
  const { settings } = game.room!;
  const max = settings.messageLimits ? 160 : 500;
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const result = await game.send('chat:send', { text });
    setSending(false);
    if (result.ok) {
      setText('');
      setError('');
    } else {
      setError(result.error.message);
    }
  }

  return (
    <form onSubmit={send}>
      <div className="flex items-end gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            game.notifyTyping();
          }}
          maxLength={max}
          placeholder="Mensagem"
          aria-label="Mensagem"
          enterKeyHint="send"
          className="min-w-0 flex-1 rounded-full bg-raised px-4 py-3 text-[16px] placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Enviar"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mint text-ink disabled:bg-line disabled:text-muted"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
            <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" />
          </svg>
        </button>
      </div>
      <div className="mt-1 flex justify-between px-2 text-xs">
        <ErrorText>{error}</ErrorText>
        {text.length > max * 0.7 && (
          <span className="ml-auto text-muted tabular-nums">
            {text.length}/{max}
          </span>
        )}
      </div>
    </form>
  );
}

function FlashBanner({ question, endsAt, game }: { question: string; endsAt: string; game: Game }) {
  const remaining = useRemaining(endsAt, game.clockOffset);
  if (remaining <= 0) return null;
  return (
    <div className="flex items-center gap-3 bg-amber px-4 py-2 text-ink">
      <span className="flex-1 text-sm font-semibold">⚡ {question}</span>
      <span className="font-display font-bold tabular-nums">{formatRemaining(remaining)}</span>
    </div>
  );
}

function ReportSheet({
  game,
  messageId,
  onClose,
}: {
  game: Game;
  messageId: string | null;
  onClose: () => void;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function report(reason: string) {
    if (!messageId) return;
    const result = await game.send('chat:report', { messageId, reason });
    if (result.ok) setDone(true);
    else setError(result.error.message);
  }

  function close() {
    setDone(false);
    setError('');
    onClose();
  }

  return (
    <Sheet open={messageId !== null} onClose={close} title="Denunciar mensagem">
      {done ? (
        <p className="text-muted">Denúncia registrada. Obrigado por avisar.</p>
      ) : (
        <div className="space-y-2">
          {REPORT_REASONS.map((reason) => (
            <Button
              key={reason}
              variant="secondary"
              className="w-full justify-start"
              onClick={() => report(reason)}
            >
              {reason}
            </Button>
          ))}
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Sheet>
  );
}
