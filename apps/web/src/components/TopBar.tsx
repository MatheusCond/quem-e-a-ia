import type { ReactNode } from 'react';
import { formatRemaining, useRemaining } from '../lib/time';

export interface PhaseTimer {
  deadline: string | null;
  totalMs: number | null;
  clockOffset: number;
  label: string;
}

/**
 * Cabeçalho das telas da sala. Com `timer`, mostra a contagem regressiva à
 * direita e uma barra fina embaixo que esvazia até o fim da fase.
 */
export function TopBar({
  title,
  subtitle,
  leading,
  right,
  timer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  right?: ReactNode;
  timer?: PhaseTimer;
}) {
  return (
    <header className="relative bg-night pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3 px-4 pb-3">
        {leading}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg leading-tight font-bold">{title}</h1>
          {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
        </div>
        {right}
        {timer && <Countdown timer={timer} />}
      </div>
      {timer && <PhaseBar timer={timer} />}
    </header>
  );
}

const URGENT_MS = 15_000;

function Countdown({ timer }: { timer: PhaseTimer }) {
  const remaining = useRemaining(timer.deadline, timer.clockOffset);
  if (!timer.deadline) return null;
  const urgent = remaining < URGENT_MS;
  return (
    <div className="shrink-0 text-right">
      <div
        className={`font-display text-xl leading-none font-bold tabular-nums ${urgent ? 'text-amber' : 'text-text'}`}
      >
        {formatRemaining(remaining)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{timer.label}</div>
    </div>
  );
}

function PhaseBar({ timer }: { timer: PhaseTimer }) {
  const remaining = useRemaining(timer.deadline, timer.clockOffset);
  if (!timer.deadline || !timer.totalMs) return <div className="h-0.5 bg-line" aria-hidden />;
  const fraction = Math.min(1, Math.max(0, remaining / timer.totalMs));
  return (
    <div className="h-0.5 bg-line" aria-hidden>
      <div
        className={`phase-bar h-full ${remaining < URGENT_MS ? 'bg-amber' : 'bg-mint'}`}
        style={{ transform: `scaleX(${fraction})` }}
      />
    </div>
  );
}
