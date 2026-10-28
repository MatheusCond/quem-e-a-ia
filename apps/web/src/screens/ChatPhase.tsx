import { GAME_RULES } from '@quem/shared';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { SeatStack } from '../components/avatars';
import { MasterPanel } from '../components/MasterPanel';
import { MessageBubble, TypingBubble } from '../components/MessageBubble';
import { TopBar } from '../components/TopBar';
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
  const [expanded, setExpanded] = useState<string | null>(null);

  const typingSeats = Object.keys(game.typing)
    .filter((id) => id !== mySeatId)
    .map((id) => seatById.get(id))
    .filter((s) => s !== undefined);

  // O tema fica fixado no topo; o balão do sistema com ele seria repetido.
  const messages = game.messages.filter((m) => m.kind !== 'theme');

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, typingSeats.length]);

  const subtitle =
    typingSeats.length > 0 ? (
      <span className="text-mint">{typingSeats.map((s) => s.pseudonym).join(', ')} digitando…</span>
    ) : (
      `${match.seats.length} participantes`
    );

  return (
    <>
      <TopBar
        leading={<SeatStack seats={match.seats} />}
        title={conversation ? 'Quem é a IA?' : 'Hora de votar'}
        subtitle={subtitle}
        right={
          conversation &&
          settings.voteLock &&
          match.canVote && (
            <Button
              variant="amber"
              className="shrink-0 px-3 py-1.5 text-sm"
              onClick={() => setVoteOpen(true)}
            >
              {match.votes.mine?.locked ? 'Voto travado' : 'Votar'}
            </Button>
          )
        }
        timer={{
          deadline: match.phaseEndsAt,
          totalMs: match.phaseDurationMs,
          clockOffset: game.clockOffset,
          label: conversation ? 'de conversa' : 'para votar',
        }}
      />

      {match.theme && (
        <div className="flex items-start gap-2 border-b border-line bg-night px-4 py-2.5 text-sm">
          <span aria-hidden>📌</span>
          <p>
            <span className="text-muted">Tema da rodada: </span>
            {match.theme}
          </p>
        </div>
      )}
      {match.flash && (
        <FlashBanner question={match.flash.question} endsAt={match.flash.endsAt} game={game} />
      )}
      {match.aiResting && (
        <p className="bg-amber/15 px-4 py-2 text-sm text-amber">
          A IA está descansando, voltem mais tarde. Hora de votar!
        </p>
      )}
      {match.role === 'spectator' && (
        <p className="bg-night px-4 py-2 text-sm text-muted">
          Você está assistindo esta partida e joga a próxima.
        </p>
      )}

      <div
        ref={listRef}
        className="chat-wall relative min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4"
        role="log"
        aria-live="polite"
        aria-label="Conversa"
      >
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted">
            Ninguém falou nada ainda. Puxe assunto!
          </p>
        )}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const mine = message.seatId !== null && message.seatId === mySeatId;
          const reportable = !mine && message.kind === 'chat';
          return (
            <MessageBubble
              key={message.id}
              message={message}
              seat={message.seatId ? seatById.get(message.seatId) : undefined}
              mine={mine}
              showAuthor={previous?.seatId !== message.seatId || previous?.kind !== 'chat'}
              expanded={expanded === message.id}
              onToggle={
                reportable
                  ? () => setExpanded(expanded === message.id ? null : message.id)
                  : undefined
              }
              onReport={() => {
                setExpanded(null);
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
  const max = settings.messageLimits ? GAME_RULES.maxMessageChars : GAME_RULES.hardMaxMessageChars;
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
        <label className="min-w-0 flex-1">
          <span className="sr-only">Mensagem</span>
          <input
            name="message"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              game.notifyTyping();
            }}
            maxLength={max}
            placeholder="Mensagem"
            autoComplete="off"
            enterKeyHint="send"
            className="w-full rounded-full border border-transparent bg-raised px-4 py-3 text-[16px] outline-none placeholder:text-muted focus:border-mint/60 focus-visible:ring-2 focus-visible:ring-mint/30"
          />
        </label>
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Enviar mensagem"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mint text-ink transition-colors hover:bg-[#5fdcb1] disabled:bg-line disabled:text-muted"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
            <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" />
          </svg>
        </button>
      </div>
      {(error || text.length > max * 0.7) && (
        <div className="mt-1.5 flex justify-between gap-3 px-2 text-xs">
          <ErrorText>{error}</ErrorText>
          {text.length > max * 0.7 && (
            <span className="ml-auto text-muted tabular-nums">
              {text.length}/{max}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function FlashBanner({ question, endsAt, game }: { question: string; endsAt: string; game: Game }) {
  const remaining = useRemaining(endsAt, game.clockOffset);
  if (remaining <= 0) return null;
  return (
    <div className="flex items-center gap-3 bg-amber px-4 py-2.5 text-ink" role="status">
      <span className="flex-1 text-sm font-semibold">
        <span aria-hidden>⚡ </span>Pergunta-relâmpago: {question}
      </span>
      <span className="font-display text-lg font-bold tabular-nums">
        {formatRemaining(remaining)}
      </span>
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
        <p className="text-muted" role="status">
          Denúncia registrada. Obrigado por avisar.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="mb-3 text-sm text-muted">Qual é o problema com essa mensagem?</p>
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
