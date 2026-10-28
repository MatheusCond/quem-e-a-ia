import type { ChatMessageView, SeatView } from '@quem/shared';
import type { CSSProperties, ReactNode } from 'react';
import { formatClock } from '../lib/time';
import { SeatAvatar } from './avatars';
import { SrOnly } from './ui';

/**
 * Um balão do chat. Mensagens "minhas" vão à direita; para o Mestre, as
 * mensagens da IA dele contam como dele.
 *
 * Na revelação (`message.reveal`), as falas da IA são grifadas com o
 * marca-texto âmbar; `markerIndex` escalona o grifo, uma depois da outra.
 */
export function MessageBubble({
  message,
  seat,
  mine,
  showAuthor,
  markerIndex,
  expanded = false,
  onToggle,
  onReport,
}: {
  message: ChatMessageView;
  seat: SeatView | undefined;
  mine: boolean;
  showAuthor: boolean;
  markerIndex?: number;
  /** Tocar no balão mostra as ações dele (hoje, só "Denunciar"). */
  expanded?: boolean;
  onToggle?: () => void;
  onReport?: () => void;
}) {
  if (message.kind !== 'chat' || !seat) {
    return (
      <div className="message-row my-2.5 flex justify-center">
        <p
          className={`max-w-[88%] rounded-xl px-3 py-1.5 text-center text-[13px] leading-snug ${message.kind === 'flash' ? 'bg-amber/15 font-medium text-amber' : 'bg-night text-muted'}`}
        >
          {message.text}
        </p>
      </div>
    );
  }

  const reveal = message.reveal;
  const highlighted = reveal?.isAi === true;
  const bubbleShape = mine
    ? 'rounded-2xl rounded-br-[6px] bg-bubble-out'
    : 'rounded-2xl rounded-bl-[6px] bg-bubble-in';

  const content: ReactNode = (
    <>
      {!mine && showAuthor && (
        <span className="block text-[12.5px] font-semibold" style={{ color: seat.avatar.color }}>
          {seat.pseudonym}
        </span>
      )}
      {mine && <SrOnly>Você: </SrOnly>}
      <span className="block text-[15px] leading-snug break-words whitespace-pre-wrap">
        {message.text}
      </span>
      <span className="mt-0.5 flex items-center justify-end gap-2 text-[11px] text-muted">
        {highlighted && (
          <span className="font-semibold text-amber">
            {reveal.isIntervention ? 'Mestre escreveu' : 'IA'}
            {reveal.brokeCharacter && ', saiu do personagem'}
          </span>
        )}
        <time dateTime={message.sentAt}>{formatClock(message.sentAt)}</time>
      </span>
    </>
  );

  const bubbleClass = `relative block max-w-full px-3 pt-1.5 pb-1 text-left ${bubbleShape} ${highlighted ? 'marker ring-1 ring-amber/70' : ''}`;
  const markerStyle =
    highlighted && markerIndex !== undefined
      ? ({ '--marker-delay': `${0.15 + markerIndex * 0.22}s` } as CSSProperties)
      : undefined;

  return (
    <div
      className={`message-row flex items-end gap-2 ${mine ? 'justify-end' : ''} ${showAuthor ? 'mt-2.5' : 'mt-0.5'}`}
    >
      {!mine &&
        (showAuthor ? (
          <SeatAvatar avatar={seat.avatar} size={30} />
        ) : (
          <span className="w-[30px] shrink-0" />
        ))}
      <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className={`${bubbleClass} transition-colors hover:brightness-110`}
            style={markerStyle}
          >
            {content}
          </button>
        ) : (
          <div className={bubbleClass} style={markerStyle}>
            {content}
          </div>
        )}
        {expanded && onReport && (
          <button
            type="button"
            onClick={onReport}
            className="mt-1 rounded-full bg-night px-3 py-1 text-[13px] font-semibold text-rose transition-colors hover:bg-raised"
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
    <div className="mt-2.5 flex items-end gap-2">
      <SeatAvatar avatar={seat.avatar} size={30} />
      <div className="rounded-2xl rounded-bl-[6px] bg-bubble-in px-3.5 py-3">
        <SrOnly>{seat.pseudonym} está digitando…</SrOnly>
        <span className="flex gap-1" aria-hidden>
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
        </span>
      </div>
    </div>
  );
}
