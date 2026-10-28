import { GAME_RULES } from '@quem/shared';
import { type FormEvent, useState } from 'react';
import { Countdown, TopBar } from '../components/TopBar';
import { Button, ErrorText, TextArea, TextInput } from '../components/ui';
import type { Game } from '../lib/useGame';

const PERSONA_TIPS = [
  'Jeito de escrever: tudo minúsculo? muito "kkkk"? usa emoji?',
  'Gírias e erros de digitação de propósito',
  'Opiniões fortes (time, comida, séries)',
  'Memórias e piadas internas do grupo',
  'Estratégia: o que responder se perguntarem "você é a IA?"',
];

export function CreationPhase({ game }: { game: Game }) {
  const match = game.room!.match!;
  const right = (
    <Countdown
      deadline={match.phaseEndsAt}
      clockOffset={game.clockOffset}
      label="para a conversa"
    />
  );

  if (match.role === 'master') {
    return (
      <>
        <TopBar
          title="Você é o Mestre da IA"
          subtitle="Ninguém mais sabe. Não conte!"
          right={right}
        />
        <MasterForm game={game} />
      </>
    );
  }

  return (
    <>
      <TopBar title="Criação da IA" subtitle={`Partida ${match.number}`} right={right} />
      <div className="chat-wall flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex gap-1.5" aria-hidden>
          <span className="typing-dot h-3 w-3 rounded-full bg-amber" />
          <span className="typing-dot h-3 w-3 rounded-full bg-amber" />
          <span className="typing-dot h-3 w-3 rounded-full bg-amber" />
        </div>
        <h2 className="font-display text-3xl leading-tight font-extrabold">
          Alguém está ensinando a IA a falar como gente.
        </h2>
        <p className="mt-3 max-w-[32ch] text-muted">
          Pode ser qualquer um do grupo. Enquanto isso, pense em perguntas que só um amigo de
          verdade saberia responder.
        </p>
        {match.role === 'spectator' && (
          <p className="mt-6 rounded-xl bg-night p-3 text-sm text-muted">
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
  // Chave própria só em conexão segura (HTTPS ou localhost).
  const canUseOwnKey = window.isSecureContext;

  async function submit(event: FormEvent) {
    event.preventDefault();
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
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h2 className="font-display text-3xl font-extrabold">A IA está pronta.</h2>
        <p className="mt-2 text-muted">
          A conversa começa assim que o tempo acabar. Lembre: no chat, você só observa.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto px-4 pt-4 pb-6">
      <p className="text-[15px] text-muted">
        Na conversa, a IA ocupa o seu lugar com um nome falso. Escreva quem ela é. Quanto mais
        parecida com alguém do grupo, melhor.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-muted">
        {PERSONA_TIPS.map((tip) => (
          <li key={tip}>• {tip}</li>
        ))}
      </ul>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-semibold">Personalidade da IA</span>
        <TextArea
          rows={7}
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          maxLength={GAME_RULES.maxPersonaChars}
          placeholder="Ex.: escreve tudo em minúsculas, fala 'mano' toda hora, odeia pizza de abacaxi, lembra do churrasco que choveu. Se perguntarem se é IA, ri e muda de assunto."
          required
        />
        <span className="mt-1 block text-right text-xs text-muted tabular-nums">
          {persona.length}/{GAME_RULES.maxPersonaChars}
        </span>
      </label>

      {settings.mirrorMode && (
        <label className="mt-2 block">
          <span className="mb-1 block text-sm font-semibold">Modo espelho</span>
          <span className="mb-2 block text-sm text-muted">
            Cole até {GAME_RULES.maxMirrorSamples} mensagens reais suas, uma por linha. A IA vai
            imitar o seu estilo.
          </span>
          <TextArea rows={4} value={samples} onChange={(e) => setSamples(e.target.value)} />
        </label>
      )}

      {canUseOwnKey && (
        <details className="mt-4 rounded-xl bg-night p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Usar minha própria chave
          </summary>
          <p className="mt-2 text-sm text-muted">
            Uma chave do Gemini sua, para jogar sem o limite diário do servidor. Ela é usada só
            nesta partida, fica apenas na memória do servidor, nunca é salva nem mostrada de volta.
          </p>
          <TextInput
            type="password"
            value={ownKey}
            onChange={(e) => setOwnKey(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            className="mt-2"
          />
        </details>
      )}

      <div className="mt-auto pt-4">
        <ErrorText>{error}</ErrorText>
        <Button
          type="submit"
          variant="amber"
          className="mt-2 w-full"
          disabled={busy || persona.trim().length < 10}
        >
          Soltar a IA no chat
        </Button>
      </div>
    </form>
  );
}
