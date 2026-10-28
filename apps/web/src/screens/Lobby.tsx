import { GAME_RULES } from '@quem/shared';
import { useRef, useState } from 'react';
import { PlayerAvatar } from '../components/avatars';
import { SettingsPanel } from '../components/SettingsPanel';
import { TopBar } from '../components/TopBar';
import { Button, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { loadToken, readFlag, writeFlag } from '../lib/session';
import { copyRoomLink, whatsappShareUrl } from '../lib/share';
import type { Game } from '../lib/useGame';

export function Lobby({ game }: { game: Game }) {
  const room = game.room!;
  const me = room.players.find((p) => p.id === room.me.playerId);
  const isHost = room.hostPlayerId === room.me.playerId;
  const online = room.players.filter((p) => p.connected);
  const host = room.players.find((p) => p.isHost);
  const hasScores = room.players.some((p) => p.totalScore !== 0);
  const players = hasScores
    ? [...room.players].sort((a, b) => b.totalScore - a.totalScore)
    : room.players;

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [privacySeen, setPrivacySeen] = useState(() => readFlag('privacidade'));
  const photoInput = useRef<HTMLInputElement>(null);

  async function start() {
    setError('');
    const result = await game.send('match:start');
    if (!result.ok) setError(result.error.message);
  }

  async function changePhoto(file: File | undefined) {
    const token = loadToken(room.code);
    if (!file || !token) return;
    try {
      await api.uploadAvatar(token, file);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar a foto.');
    }
  }

  return (
    <>
      <TopBar title={`Sala ${room.code}`} subtitle={`${online.length} online`} />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <section className="mt-4 rounded-2xl bg-night p-4">
          <p className="text-sm text-muted">Chame o grupo com este código</p>
          <p className="font-display text-4xl font-extrabold tracking-[0.15em]">{room.code}</p>
          <a
            href={whatsappShareUrl(room.code)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex w-full items-center justify-center rounded-full bg-mint px-4 py-3 font-semibold text-ink"
          >
            Compartilhar no WhatsApp
          </a>
          <Button
            variant="ghost"
            className="mt-1 w-full"
            onClick={async () => setCopied(await copyRoomLink(room.code))}
          >
            {copied ? 'Link copiado' : 'Copiar link da sala'}
          </Button>
        </section>

        {!privacySeen && (
          <section className="mt-4 rounded-2xl border border-amber/40 p-4 text-sm">
            <p>
              As mensagens do chat são enviadas a um provedor de IA (por padrão, o Google Gemini)
              para gerar as falas da IA. No nível gratuito, o provedor pode usar esses dados para
              melhorar os produtos dele. Não escrevam dados pessoais nem senhas.
            </p>
            <button
              type="button"
              className="mt-2 font-semibold text-amber"
              onClick={() => {
                writeFlag('privacidade');
                setPrivacySeen(true);
              }}
            >
              Entendi
            </button>
          </section>
        )}

        <section className="mt-6">
          <h2 className="font-display text-lg font-bold">
            {hasScores ? 'Ranking da sala' : 'Quem está aqui'}
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {players.map((player, index) => (
              <li key={player.id} className="flex items-center gap-3 py-2.5">
                {hasScores && (
                  <span className="w-5 text-right text-muted tabular-nums">{index + 1}</span>
                )}
                <span className="relative">
                  <PlayerAvatar player={player} />
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-ink ${player.connected ? 'bg-mint' : 'bg-line'}`}
                    title={player.connected ? 'online' : 'offline'}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {player.nickname}
                  {player.id === me?.id && <span className="text-muted"> (você)</span>}
                  {player.isHost && <span className="ml-2 text-xs text-amber">anfitrião</span>}
                </span>
                {hasScores && (
                  <span className="font-semibold tabular-nums">{player.totalScore} pts</span>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            className="mt-2 text-sm font-semibold text-mint"
          >
            {me?.avatarUrl ? 'Trocar minha foto' : 'Colocar uma foto'}
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => changePhoto(e.target.files?.[0])}
          />
        </section>

        <SettingsPanel game={game} editable={isHost} />
      </div>

      <footer className="border-t border-line bg-night p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ErrorText>{error}</ErrorText>
        {isHost ? (
          <>
            <Button
              className="w-full"
              onClick={start}
              disabled={online.length < GAME_RULES.minPlayers}
            >
              Começar partida
            </Button>
            {online.length < GAME_RULES.minPlayers && (
              <p className="mt-2 text-center text-sm text-muted">
                Precisa de pelo menos {GAME_RULES.minPlayers} pessoas online.
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-muted">
            Esperando {host?.nickname ?? 'o anfitrião'} começar.
          </p>
        )}
      </footer>
    </>
  );
}
