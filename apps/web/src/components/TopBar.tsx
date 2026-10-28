import type { ReactNode } from 'react';
import { formatRemaining, useRemaining } from '../lib/time';

export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 bg-night px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg leading-tight font-bold">{title}</h1>
        {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
      </div>
      {right}
    </header>
  );
}

/** Contagem regressiva da fase. Fica âmbar nos últimos 15 segundos. */
export function Countdown({
  deadline,
  clockOffset,
  label,
}: {
  deadline: string | null;
  clockOffset: number;
  label?: string;
}) {
  const remaining = useRemaining(deadline, clockOffset);
  if (!deadline) return null;
  const urgent = remaining < 15_000;
  return (
    <div className="text-right" aria-live="off">
      <div
        className={`font-display text-xl font-bold tabular-nums ${urgent ? 'text-amber' : 'text-text'}`}
      >
        {formatRemaining(remaining)}
      </div>
      {label && <div className="text-[11px] text-muted">{label}</div>}
    </div>
  );
}
