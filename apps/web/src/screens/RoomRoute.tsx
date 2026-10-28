import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ErrorText, TextInput } from '../components/ui';
import { api, ApiError, type RoomSummary } from '../lib/api';
import { clearToken, loadToken, saveToken } from '../lib/session';
import { RoomScreen } from './RoomScreen';

/**
 * Rota /sala/:code. Quem já tem token desta sala entra direto (inclusive
 * depois de cair); quem chegou pelo link do WhatsApp escolhe um apelido.
 */
export function RoomRoute() {
  const code = (useParams().code ?? '').toUpperCase();
  const [token, setToken] = useState(() => loadToken(code));
  const [notice, setNotice] = useState('');

  if (token) {
    return (
      <RoomScreen
        code={code}
        token={token}
        onRejected={(reason) => {
          clearToken(code);
          setNotice(reason);
          setToken(null);
        }}
      />
    );
  }
  return <JoinForm code={code} notice={notice} onJoined={setToken} />;
}

function JoinForm({
  code,
  notice,
  onJoined,
}: {
  code: string;
  notice: string;
  onJoined: (token: string) => void;
}) {
  const [summary, setSummary] = useState<RoomSummary | null>(null);
  const [missing, setMissing] = useState('');
  const [nickname, setNickname] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getRoom(code)
      .then(setSummary)
      .catch((e: ApiError) => setMissing(e.message));
  }, [code]);

  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.joinRoom(code, nickname);
      saveToken(result.roomCode, result.token);
      // A foto é opcional: se falhar, a pessoa entra mesmo assim.
      if (photo) await api.uploadAvatar(result.token, photo).catch(() => undefined);
      onJoined(result.token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo deu errado.');
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-16">
        <h1 className="font-display text-3xl font-bold">Sala {code} não encontrada</h1>
        <p className="mt-2 text-muted">{missing}</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-mint">
          Criar uma sala nova
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pt-12 pb-10">
      <p className="text-muted">Você foi chamado para a sala</p>
      <h1 className="font-display text-5xl font-extrabold tracking-[0.12em]">{code}</h1>
      {summary && (
        <p className="mt-1 text-muted">
          {summary.playerCount} de {summary.maxPlayers} jogadores já estão lá.
        </p>
      )}
      {notice && <p className="mt-4 rounded-xl bg-raised p-3 text-sm">{notice}</p>}

      <form onSubmit={join} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Seu apelido</span>
          <TextInput
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Como os amigos te chamam"
            required
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">
            Foto (opcional, aparece só fora do chat)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-text"
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy || !nickname.trim() || !summary}>
          Entrar
        </Button>
      </form>
    </main>
  );
}
