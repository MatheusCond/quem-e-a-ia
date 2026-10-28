import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RoomCode } from '../components/RoomCode';
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
      setError(e instanceof ApiError ? e.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-16">
        <h1 className="font-display text-3xl font-bold">Sala {code} não encontrada</h1>
        <p className="mt-2 text-muted">{missing} Peça o link de novo para quem criou a sala.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-full font-semibold text-mint hover:underline"
        >
          Criar uma sala nova
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pt-12 pb-10">
      <p className="font-display text-[15px] font-bold text-amber" translate="no">
        Quem é a IA?
      </p>
      <h1 className="mt-4 font-display text-3xl leading-tight font-extrabold">
        Te chamaram para uma partida
      </h1>
      <div className="mt-5">
        <RoomCode code={code} />
      </div>
      <p className="mt-3 text-muted" aria-live="polite">
        {summary
          ? `${summary.playerCount} de ${summary.maxPlayers} jogadores já estão na sala.`
          : 'Procurando a sala…'}
      </p>
      {notice && <p className="mt-4 rounded-xl bg-raised p-3 text-sm">{notice}</p>}

      <form onSubmit={join} className="mt-8 space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Seu apelido</span>
          <TextInput
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Como os amigos te chamam…"
            autoComplete="nickname"
            spellCheck={false}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Foto <span className="font-normal text-muted">(opcional, aparece só fora do chat)</span>
          </span>
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-text hover:file:bg-line"
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy || !summary}>
          {busy ? 'Entrando…' : 'Entrar na sala'}
        </Button>
      </form>
    </main>
  );
}
