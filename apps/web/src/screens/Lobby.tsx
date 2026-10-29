import { GAME_RULES, type RoomToggle, TOGGLE_DESCRIPTIONS } from '@quem/shared';
import { type FormEvent, useRef, useState } from 'react';
import { PlayerAvatar } from '../components/avatars';
import { RoomCode } from '../components/RoomCode';
import { SettingsPanel } from '../components/SettingsPanel';
import { TopBar } from '../components/TopBar';
import { Button, ErrorText, SrOnly, TextInput } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { loadToken, readFlag, writeFlag } from '../lib/session';
import { copyRoomLink, whatsappShareUrl } from '../lib/share';
import type { Game } from '../lib/useGame';

const TOGGLES = Object.keys(TOGGLE_DESCRIPTIONS) as RoomToggle[];

export function Lobby({ game }: { game: Game }) {
  const room = game.room!;
  const isHost = room.hostPlayerId === room.me.playerId;
  const online = room.players.filter((p) => p.connected);
  const host = room.players.find((p) => p.isHost);
  const me = room.players.find((p) => p.id === room.me.playerId);
  const hasScores = room.players.some((p) => p.totalScore !== 0);
  const players = hasScores
    ? [...room.players].sort((a, b) => b.totalScore - a.totalScore)
    : room.players;
  const activeRules = TOGGLES.filter((key) => room.settings[key]).length;
  const missing = Math.max(0, GAME_RULES.minPlayers - online.length);

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [privacySeen, setPrivacySeen] = useState(() => readFlag('privacidade'));
  const photoInput = useRef<HTMLInputElement>(null);

  async function start() {
    setError('');
    setStarting(true);
    const result = await game.send('match:start');
    setStarting(false);
    if (!result.ok) setError(result.error.message);
  }

  async function copy() {
    setCopied(await copyRoomLink(room.code));
    setTimeout(() => setCopied(false), 2500);
  }

  async function changePhoto(file: File | undefined) {
    const token = loadToken(room.code);
    if (!file || !token) return;
    try {
      await api.uploadAvatar(token, file);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar a foto. Tente outra.');
    }
  }

  return (
    <>
      <TopBar
        title="Sala de espera"
        subtitle={`${online.length} de ${room.players.length} online`}
      />
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <section className="mt-4 rounded-3xl bg-night p-5" aria-labelledby="convite">
          <h2 id="convite" className="text-sm text-muted">
            Chame o grupo com este código
          </h2>
          <div className="mt-3">
            <RoomCode code={room.code} />
          </div>
          <a
            href={whatsappShareUrl(room.code)}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-mint px-4 py-3 font-semibold text-ink transition-colors hover:bg-[#5fdcb1] active:bg-mint-deep"
          >
            <ShareIcon />
            Compartilhar no WhatsApp
          </a>
          <Button variant="ghost" className="mt-1 w-full" onClick={copy}>
            <span aria-live="polite">{copied ? 'Link copiado ✓' : 'Copiar link da sala'}</span>
          </Button>
        </section>

        {!privacySeen && (
          <section className="mt-4 rounded-2xl border-l-4 border-amber bg-amber/10 p-4 text-sm leading-relaxed">
            <p>
              As mensagens do chat são enviadas a um provedor de IA (por padrão, o Google Gemini)
              para gerar as falas da IA. No nível gratuito, o provedor pode usar esses dados para
              melhorar os produtos dele. Não escrevam dados pessoais nem senhas.
            </p>
            <button
              type="button"
              className="mt-2 rounded-full font-semibold text-amber hover:underline"
              onClick={() => {
                writeFlag('privacidade');
                setPrivacySeen(true);
              }}
            >
              Entendi
            </button>
          </section>
        )}

        <section className="mt-7" aria-labelledby="jogadores">
          <div className="flex items-baseline justify-between">
            <h2 id="jogadores" className="font-display text-xl font-bold">
              {hasScores ? 'Ranking da sala' : 'Quem está aqui'}
            </h2>
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className="rounded-full text-sm font-semibold text-mint hover:underline"
            >
              {me?.avatarUrl ? 'Trocar minha foto' : 'Colocar foto'}
            </button>
          </div>
          <input
            ref={photoInput}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => changePhoto(e.target.files?.[0])}
          />
          <ul className="mt-3 space-y-1">
            {players.map((player, index) => (
              <li
                key={player.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${player.id === me?.id ? 'bg-night' : ''}`}
              >
                {hasScores && (
                  <span
                    className={`w-5 text-right font-display font-bold tabular-nums ${index === 0 ? 'text-amber' : 'text-muted'}`}
                  >
                    {index + 1}
                  </span>
                )}
                <span className="relative">
                  <PlayerAvatar player={player} />
                  <span
                    aria-hidden
                    className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink ${player.connected ? 'bg-mint' : 'bg-line'}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {player.nickname}
                    {player.id === me?.id && <span className="text-muted"> (você)</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {player.isHost ? 'Anfitrião' : player.connected ? 'Online' : 'Fora da sala'}
                    {player.isHost && <SrOnly>{player.connected ? ', online' : ', fora'}</SrOnly>}
                  </span>
                </span>
                {hasScores && (
                  <span className="font-display font-bold tabular-nums">
                    {player.totalScore}
                    <span className="ml-1 text-xs font-normal text-muted">pts</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <ChatNameForm game={game} />

        <details className="group mt-6 rounded-3xl bg-night" open={isHost}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl p-5 hover:bg-raised/40 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-display text-xl font-bold">Regras da sala</span>
              <span className="text-sm text-muted">
                {activeRules} de {TOGGLES.length} mecânicas ligadas
                {!isHost && '. Só o anfitrião muda.'}
              </span>
            </span>
            <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="px-5 pb-5">
            <SettingsPanel game={game} editable={isHost} />
          </div>
        </details>
      </div>

      <footer className="border-t border-line bg-night p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ErrorText>{error}</ErrorText>
        {isHost ? (
          <>
            <Button className="w-full" onClick={start} disabled={missing > 0 || starting}>
              {starting ? 'Sorteando o Mestre…' : 'Começar partida'}
            </Button>
            {missing > 0 && (
              <p className="mt-2 text-center text-sm text-muted">
                {missing === 1
                  ? 'Falta 1 pessoa entrar para começar.'
                  : `Faltam ${missing} pessoas entrarem para começar.`}
              </p>
            )}
          </>
        ) : (
          <p className="py-2 text-center text-muted">
            Esperando {host?.nickname ?? 'o anfitrião'} começar a partida.
          </p>
        )}
      </footer>
    </>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M14 5l7 7-7 7M21 12H9a6 6 0 00-6 6v1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * O nome que aparece no chat. Vazio, o jogo sorteia um pseudônimo. Só o próprio
 * jogador vê o que escolheu; os outros descobrem quando a conversa começa.
 */
function ChatNameForm({ game }: { game: Game }) {
  const saved = game.room!.me.chatName ?? '';
  const [name, setName] = useState(saved);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const changed = name.trim() !== saved;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setDone(null);
    setBusy(true);
    const result = await game.send('player:chat-name', { name });
    setBusy(false);
    if (result.ok) setDone(name.replace(/\s+/g, ' ').trim());
    else setError(result.error.message);
  }

  return (
    <form onSubmit={save} className="mt-6 rounded-3xl bg-night p-5">
      <label htmlFor="chat-name" className="block font-display text-xl font-bold">
        Seu nome no chat
      </label>
      <p className="mt-1 text-sm text-muted">
        Vale para a próxima partida. Se deixar vazio, o jogo sorteia um nome.
      </p>
      <div className="mt-3 flex gap-2">
        <TextInput
          id="chat-name"
          name="chatName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDone(null);
          }}
          maxLength={GAME_RULES.maxNicknameChars}
          placeholder="Nome sorteado…"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" disabled={busy || !changed}>
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
      <p className="mt-2 text-sm text-mint" aria-live="polite">
        {done !== null &&
          (done ? `No chat você vai aparecer como “${done}”.` : 'Seu nome será sorteado.')}
      </p>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}
