import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useEffect,
  useRef,
} from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'amber';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-mint text-ink hover:bg-[#5fdcb1] active:bg-mint-deep disabled:bg-line disabled:text-muted',
  secondary: 'bg-raised text-text hover:bg-line active:bg-[#2e3e4d] disabled:text-muted',
  ghost: 'text-mint hover:bg-raised active:bg-line disabled:text-muted',
  amber:
    'bg-amber text-ink hover:bg-[#f8c665] active:bg-[#dca234] disabled:bg-line disabled:text-muted',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Contorno de foco comum aos campos: borda menta e anel suave. */
const FIELD =
  'w-full rounded-xl border border-line bg-ink px-4 py-3 text-[16px] text-text placeholder:text-muted outline-none transition-colors focus:border-mint focus-visible:ring-2 focus-visible:ring-mint/40';

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD} ${className}`} />;
}

export function TextArea({
  className = '',
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`${FIELD} resize-none leading-relaxed ${className}`}
    />
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-mint' : 'bg-line hover:bg-[#33475a]'}`}
    >
      <span
        aria-hidden
        className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-text shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

/**
 * Painel que sobe da parte de baixo da tela (padrão de apps de celular).
 * Fecha com Esc ou tocando fora, foca o painel ao abrir e devolve o foco
 * para quem abriu ao fechar.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Em ref: quem usa passa uma função nova a cada render, e o efeito abaixo
  // só deve rodar quando o painel abre ou fecha.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="sheet-panel relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-night p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-rose">
      {children}
    </p>
  );
}

/** Texto visível só para leitores de tela. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
