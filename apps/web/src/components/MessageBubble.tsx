import type { ChatMessageView, SeatView } from '@quem/shared';
import { formatClock } from '../lib/time';
import { SeatAvatar } from './avatars';

/**
 * Um balão do chat. Mensagens "minhas" vão à direita; para o Mestre, as
 * mensagens da IA dele contam como dele. Na revelação, as falas da IA
 * ganham contorno âmbar.
 */
export function MessageBubble({
  message,
  seat,
  mine,
  showAuthor,
  selected = false,
  onSelect,
  onReport,
}: {
  message: ChatMessageView;
  seat: SeatView | undefined;
  mine: boolean;
  showAuthor: boolean;
  /** Tocar no balão mostra as ações (hoje, só "Denunciar"). */
  selected?: boolean;
  onSelect?: () => void;
  onReport?: () => void;
}) {
  if (message.kind !== 'chat' || !seat) {
    return (
      <div className="my-2 flex justify-center">
        <div
          className={`max-w-[88%] rounded-xl px-3 py-1.5 text-center text-[13px] ${message.kind === 'flash' ? 'bg-amber/15 text-amber' : 'bg-night text-muted'}`}
        >
          {message.text}
        </div>
      </div>
    );
  }

  const reveal = message.reveal;
  const ring = reveal?.isAi ? 'ring-2 ring-amber' : '';

  return (
    <div
      className={`flex items-end gap-2 ${mine ? 'justify-end' : ''} ${showAuthor ? 'mt-2' : 'mt-0.5'}`}
    >
      {!mine &&
        (showAuthor ? (
          <SeatAvatar avatar={seat.avatar} size={28} />
        ) : (
          <span className="w-7 shrink-0" />
        ))}
      <div
        onClick={onSelect}
        className={`relative max-w-[78%] rounded-2xl px-3 pt-1.5 pb-1 ${mine ? 'rounded-br-md bg-bubble-out' : 'rounded-bl-md bg-bubble-in'} ${ring} ${onSelect ? 'cursor-pointer' : ''}`}
      >
        {!mine && showAuthor && (
          <div className="text-[12.5px] font-semibold" style={{ color: seat.avatar.color }}>
            {seat.pseudonym}
          </div>
        )}
        <div className="text-[15px] leading-snug break-words whitespace-pre-wrap">
          {message.text}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px] text-muted">
          {reveal?.isAi && (
            <span className="font-semibold text-amber">
              {reveal.isIntervention ? 'Mestre escreveu' : 'IA'}
              {reveal.brokeCharacter && ' · saiu do personagem'}
            </span>
          )}
          <time dateTime={message.sentAt}>{formatClock(message.sentAt)}</time>
        </div>
        {selected && onReport && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReport();
            }}
            className="mt-1 w-full border-t border-line pt-1 text-left text-[13px] font-semibold text-rose"
          >
            Denunciar mensagem
          </button>
        )}
      </div>
    </div>
  );
}

export function TypingBubble({ seat }: { seat: SeatView }) {
  return (
    <div className="mt-2 flex items-end gap-2">
      <SeatAvatar avatar={seat.avatar} size={28} />
      <div
        className="rounded-2xl rounded-bl-md bg-bubble-in px-3 py-2.5"
        aria-label={`${seat.pseudonym} está digitando`}
      >
        <span className="flex gap-1">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
        </span>
      </div>
    </div>
  );
}
