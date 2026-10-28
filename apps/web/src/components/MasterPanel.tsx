import { GAME_RULES } from '@quem/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { formatRemaining, useRemaining } from '../lib/time';
import type { Game } from '../lib/useGame';
import { SeatAvatar } from './avatars';
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
  const max = settings.messageLimits ? GAME_RULES.maxMessageChars : GAME_RULES.hardMaxMessageChars;

  if (match.phase !== 'conversation') {
    return (
      <p className="py-1 text-center text-sm text-muted">
        Você é o Mestre: agora é só torcer na votação.
      </p>
    );
  }
  if (game.draft) return <DraftEditor game={game} />;

  async function intervene(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
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

  const canIntervene = settings.masterInterventions && master.interventionsLeft > 0;

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm text-muted">
        {aiSeat && <SeatAvatar avatar={aiSeat.avatar} size={22} />}
        <span>
          Sua IA é <strong className="text-amber">{aiSeat?.pseudonym}</strong>. Você só observa
          {canIntervene &&
            ` (${master.interventionsLeft} ${master.interventionsLeft === 1 ? 'intervenção' : 'intervenções'})`}
          .
        </span>
      </p>
      {canIntervene && (
        <>
          <form onSubmit={intervene} className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Escrever como a IA</span>
              <TextInput
                name="intervention"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Falar como a IA…"
                maxLength={max}
                autoComplete="off"
                className="rounded-full"
              />
            </label>
            <Button type="submit" variant="amber" disabled={!text.trim()}>
              Enviar
            </Button>
          </form>
          <label
            htmlFor="review-next"
            className="flex cursor-pointer items-center justify-between gap-3 text-sm"
          >
            <span>Revisar a próxima resposta da IA antes de ela sair</span>
            <Switch
              id="review-next"
              label="Revisar a próxima resposta da IA"
              checked={master.reviewNext}
              onChange={toggleReview}
            />
          </label>
        </>
      )}
      {settings.masterInterventions && !canIntervene && (
        <p className="text-sm text-muted">
          Você já usou as {GAME_RULES.masterInterventions} intervenções.
        </p>
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

  async function approve(event: FormEvent) {
    event.preventDefault();
    const result = await game.send('master:approve-draft', { draftId: draft.draftId, text });
    if (result.ok) game.clearDraft();
    else setError(result.error.message);
  }

  return (
    <form onSubmit={approve} className="space-y-2" aria-live="polite">
      <label htmlFor="draft" className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-amber">A IA quer mandar isto</span>
        <span className="text-muted tabular-nums">{formatRemaining(remaining)}</span>
      </label>
      <TextArea
        id="draft"
        name="draft"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="amber" className="w-full" disabled={!text.trim()}>
        {text === draft.text ? 'Enviar como está' : 'Enviar editada (gasta 1 intervenção)'}
      </Button>
    </form>
  );
}
