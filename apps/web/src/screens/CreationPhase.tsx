import { GAME_RULES } from '@quem/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Button, ErrorText, TextArea, TextInput } from '../components/ui';
import type { Game } from '../lib/useGame';

/**
 * Atalhos para montar a personalidade. Tocar num deles começa uma linha nova
 * com o tema, e o Mestre só completa.
 */
const PERSONA_STARTERS = [
  { label: 'Jeito de escrever', line: 'Escreve assim: ' },
  { label: 'Gírias', line: 'Gírias que usa: ' },
  { label: 'Erros de digitação', line: 'Erra de propósito: ' },
  { label: 'Opiniões', line: 'Opiniões fortes: ' },
  { label: 'Piadas internas', line: 'Lembra que o grupo: ' },
  { label: 'Se perguntarem se é IA', line: 'Se perguntarem se é IA: ' },
];

export function CreationPhase({ game }: { game: Game }) {
  const match = game.room!.match!;
  const timer = {
    deadline: match.phaseEndsAt,
    totalMs: match.phaseDurationMs,
    clockOffset: game.clockOffset,
    label: 'para a conversa',
  };

  if (match.role === 'master') {
    return (
      <>
        <TopBar
          title="Você é o Mestre da IA"
          subtitle="Ninguém mais sabe. Não conte!"
          timer={timer}
        />
        <MasterForm game={game} />
      </>
    );
  }

  return (
    <>
      <TopBar title="Criação da IA" subtitle={`Partida ${match.number}`} timer={timer} />
      <div className="chat-wall relative flex min-h-0 flex-1 flex-col items-center justify-center-safe overflow-y-auto px-6 py-8 text-center">
        <div className="mb-7 flex gap-2" aria-hidden>
          <span className="typing-dot h-3.5 w-3.5 rounded-full bg-amber" />
          <span className="typing-dot h-3.5 w-3.5 rounded-full bg-amber" />
          <span className="typing-dot h-3.5 w-3.5 rounded-full bg-amber" />
        </div>
        <h2 className="max-w-[16ch] font-display text-[34px] leading-[1.05] font-extrabold">
          Alguém está ensinando a IA a falar como gente.
        </h2>
        <p className="mt-4 max-w-[32ch] leading-relaxed text-muted">
          Pode ser qualquer um do grupo. Enquanto isso, pense em perguntas que só um amigo de
          verdade saberia responder.
        </p>
        {match.role === 'spectator' && (
          <p className="mt-8 rounded-2xl bg-night p-4 text-sm text-muted">
            Você chegou com a partida em andamento: vai assistir esta e jogar a próxima.
          </p>
        )}
      </div>
    </>
  );
}

function MasterForm({ game }: { game: Game }) {
  const { settings } = game.room!;
  const master = game.room!.match!.master!;
  const [persona, setPersona] = useState(master.persona ?? '');
  const [samples, setSamples] = useState(master.mirrorSamples.join('\n'));
  const [ownKey, setOwnKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const personaRef = useRef<HTMLTextAreaElement>(null);
  // Chave própria só em conexão segura (HTTPS ou localhost).
  const canUseOwnKey = window.isSecureContext;
  const tooShort = persona.trim().length < 10;

  // Fechar a aba no meio da escrita perderia a personalidade.
  useEffect(() => {
    if (!persona.trim() || master.submitted) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [persona, master.submitted]);

  function addStarter(line: string) {
    const next = persona.trim() ? `${persona.trimEnd()}\n${line}` : line;
    setPersona(next.slice(0, GAME_RULES.maxPersonaChars));
    requestAnimationFrame(() => {
      const field = personaRef.current;
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (tooShort) {
      setError('Escreva pelo menos uma frase sobre como a IA fala.');
      personaRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    const result = await game.send('creation:submit', {
      persona,
      mirrorSamples: settings.mirrorMode ? samples.split('\n') : undefined,
      ownApiKey: ownKey.trim() || undefined,
    });
    setBusy(false);
    if (result.ok) setOwnKey('');
    else setError(result.error.message);
  }

  if (master.submitted) {
    return (
      <div className="chat-wall relative flex min-h-0 flex-1 flex-col items-center justify-center-safe overflow-y-auto px-6 py-8 text-center">
        <p className="font-display text-5xl" aria-hidden>
          🤫
        </p>
        <h2 className="mt-4 font-display text-3xl font-extrabold">A IA está pronta.</h2>
        <p className="mt-3 max-w-[30ch] leading-relaxed text-muted">
          A conversa começa quando o tempo acabar. No chat, você só observa (e pode intervir 3
          vezes).
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-6"
    >
      <p className="text-[15px] leading-relaxed text-muted">
        Na conversa, a IA ocupa o seu lugar com um nome falso. Escreva quem ela é. Quanto mais
        parecida com alguém do grupo, melhor.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Começar uma linha sobre">
        {PERSONA_STARTERS.map((starter) => (
          <button
            key={starter.label}
            type="button"
            onClick={() => addStarter(starter.line)}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-text transition-colors hover:border-amber hover:text-amber"
          >
            + {starter.label}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
          Personalidade da IA
          <span className="font-normal text-muted tabular-nums">
            {persona.length}/{GAME_RULES.maxPersonaChars}
          </span>
        </span>
        <TextArea
          ref={personaRef}
          name="persona"
          rows={8}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          maxLength={GAME_RULES.maxPersonaChars}
          placeholder="Ex.: escreve tudo em minúsculas, fala “mano” toda hora, odeia pizza de abacaxi, lembra do churrasco que choveu. Se perguntarem se é IA, ri e muda de assunto…"
          aria-invalid={Boolean(error) && tooShort}
        />
      </label>

      {settings.mirrorMode && (
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-semibold">Modo espelho</span>
          <span className="mb-2 block text-sm text-muted">
            Cole até {GAME_RULES.maxMirrorSamples} mensagens reais suas, uma por linha. A IA vai
            imitar o seu estilo.
          </span>
          <TextArea
            name="mirror-samples"
            rows={4}
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            placeholder="eae mano kkkk…"
          />
        </label>
      )}

      {canUseOwnKey && (
        <details className="group mt-5 rounded-2xl bg-night">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl p-4 text-sm font-semibold hover:bg-raised/40 [&::-webkit-details-marker]:hidden">
            Usar minha própria chave
            <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="px-4 pb-4">
            <p className="text-sm leading-relaxed text-muted">
              Uma chave do Gemini sua, para jogar sem o limite diário do servidor. Ela vale só nesta
              partida, fica apenas na memória do servidor e nunca é salva nem mostrada de volta.
            </p>
            <label className="mt-3 block">
              <span className="sr-only">Sua chave do Gemini</span>
              <TextInput
                name="own-api-key"
                type="password"
                value={ownKey}
                onChange={(e) => setOwnKey(e.target.value)}
                placeholder="AIza…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
        </details>
      )}

      <div className="mt-auto pt-5">
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="amber" className="mt-2 w-full" disabled={busy}>
          {busy ? 'Soltando a IA…' : 'Soltar a IA no chat'}
        </Button>
      </div>
    </form>
  );
}
