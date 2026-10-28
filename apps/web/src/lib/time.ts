import { useEffect, useState } from 'react';

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Milissegundos até `deadline`, atualizado a cada meio segundo.
 * `clockOffset` corrige a diferença entre o relógio do celular e o do
 * servidor: quem decide o fim da fase é o servidor.
 */
export function useRemaining(deadline: string | null | undefined, clockOffset: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [deadline]);
  if (!deadline) return 0;
  return new Date(deadline).getTime() - (now + clockOffset);
}
