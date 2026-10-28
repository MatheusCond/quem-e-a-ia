import { useEffect, useState } from 'react';
import { formatRemaining, useRemaining } from '../lib/time';
import type { Game } from '../lib/useGame';
import { Button, ErrorText, Switch, TextArea, TextInput } from './ui';

/**
 * Painel do Mestre durante a conversa: escrever no lugar da IA ou revisar
 * a próxima resposta dela antes de ir para o chat.
 */
export function MasterPanel({ game }: { game: Game }) {
  const { settings } = game.room!;
  const match = game.room!.match!;
  const master = match.master!;
  const aiSeat = match.seats.find((s) => s.seatId === master.aiSeatId);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  if (match.phase !== 'conversation') {
    return <p className="text-center text-sm text-muted">Você é o Mestre: só assiste a votação.</p>;
  }
  if (game.draft) return <DraftEditor game={game} />;

  async function intervene() {
    setError('');
    const result = await game.send('master:intervene', { text });
    if (result.ok) setText('');
    else setError(result.error.message);
  }

  async function toggleReview(enabled: boolean) {
    setError('');
    const result = await game.send('master:review-next', { enabled });
    if (!result.ok) setError(result.error.message);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Sua IA é <strong className="text-amber">{aiSeat?.pseudonym}</strong>. Você não digita no
        chat.
      </p>
      {settings.masterInterventions && master.interventionsLeft > 0 ? (
        <>
          <div className="flex gap-2">
            <TextInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Escrever como a IA (${master.interventionsLeft} restantes)`}
              maxLength={settings.messageLimits ? 160 : 500}
              onKeyDown={(e) => e.key === 'Enter' && text.trim() && intervene()}
            />
            <Button variant="amber" onClick={intervene} disabled={!text.trim()}>
              Enviar
            </Button>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Revisar a próxima resposta da IA antes de enviar</span>
            <Switch
              label="Revisar a próxima resposta"
              checked={master.reviewNext}
              onChange={toggleReview}
            />
          </label>
        </>
      ) : (
        settings.masterInterventions && (
          <p className="text-sm text-muted">Você já usou as 3 intervenções.</p>
        )
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function DraftEditor({ game }: { game: Game }) {
  const draft = game.draft!;
  const [text, setText] = useState(draft.text);
  const [error, setError] = useState('');
  const remaining = useRemaining(draft.expiresAt, game.clockOffset);

  useEffect(() => setText(draft.text), [draft.draftId, draft.text]);
  useEffect(() => {
    if (remaining <= 0) game.clearDraft();
  }, [remaining, game]);

  async function approve() {
    const result = await game.send('master:approve-draft', { draftId: draft.draftId, text });
    if (result.ok) game.clearDraft();
    else setError(result.error.message);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-amber">A IA quer mandar isto</span>
        <span className="text-muted tabular-nums">{formatRemaining(remaining)}</span>
      </div>
      <TextArea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <Button variant="amber" className="w-full" onClick={approve} disabled={!text.trim()}>
        {text === draft.text ? 'Enviar como está' : 'Enviar editada (gasta 1 intervenção)'}
      </Button>
    </div>
  );
}
