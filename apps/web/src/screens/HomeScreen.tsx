import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorText, TextInput } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { saveToken } from '../lib/session';

/** Conversa de mentira no topo: é o jogo explicado sem palavras. */
const PREVIEW = [
  { who: 'Capivara Zen', color: '#2a9d8f', emoji: '🦊', text: 'gente quem comeu meu pastel ontem' },
  { who: 'Tatu-Bola', color: '#8e6bd9', emoji: '🐢', text: 'kkkkk não fui eu, juro' },
  {
    who: 'Coxinha Astral',
    color: '#e76f51',
    emoji: '🐙',
    text: 'eu nem gosto de pastel 🙄',
    suspect: true,
  },
];

export function HomeScreen() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function enter(event: FormEvent, mode: 'create' | 'join') {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result =
        mode === 'create'
          ? await api.createRoom(nickname)
          : await api.joinRoom(code.trim().toUpperCase(), nickname);
      saveToken(result.roomCode, result.token);
      navigate(`/sala/${result.roomCode}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo deu errado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col px-4 pt-10 pb-10">
      <h1 className="font-display text-[44px] leading-[0.95] font-extrabold tracking-tight">
        Um de vocês
        <br />é uma IA.
      </h1>
      <p className="mt-3 max-w-[34ch] text-[17px] text-muted">
        Um chat em grupo com os amigos, todo mundo com nome falso. Alguém ensinou uma IA a falar
        como gente. Descubram quem é.
      </p>

      <div className="chat-wall mt-6 space-y-2 rounded-2xl border border-line p-3" aria-hidden>
        {PREVIEW.map((m) => (
          <div key={m.who} className="flex items-end gap-2">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm"
              style={{ background: m.color }}
            >
              {m.emoji}
            </span>
            <div
              className={`max-w-[80%] rounded-2xl rounded-bl-md bg-bubble-in px-3 py-1.5 ${m.suspect ? 'ring-2 ring-amber' : ''}`}
            >
              <div className="text-[12px] font-semibold" style={{ color: m.color }}>
                {m.who}
              </div>
              <div className="text-[15px]">{m.text}</div>
            </div>
            {m.suspect && (
              <span className="pb-1 font-display text-2xl font-extrabold text-amber">?</span>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => enter(e, code ? 'join' : 'create')} className="mt-8 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Seu apelido</span>
          <TextInput
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Como os amigos te chamam"
            autoComplete="nickname"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">
            Código da sala (se alguém te passou)
          </span>
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="Ex.: K7QX2M"
            autoCapitalize="characters"
            className="tracking-[0.2em]"
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy || !nickname.trim()}>
          {code ? 'Entrar na sala' : 'Criar sala'}
        </Button>
      </form>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Como funciona</h2>
        <ol className="mt-3 space-y-3 text-[15px] text-muted">
          <li>
            <strong className="text-text">1. Chame o grupo.</strong> Crie a sala e mande o link no
            WhatsApp. Cada um entra pelo navegador do celular.
          </li>
          <li>
            <strong className="text-text">2. Alguém vira Mestre, em segredo.</strong> Em 2 minutos
            ele escreve a personalidade da IA: gírias, manias, piadas internas.
          </li>
          <li>
            <strong className="text-text">3. Conversem.</strong> Todo mundo aparece com nome e
            avatar sorteados. No lugar do Mestre, quem fala é a IA.
          </li>
          <li>
            <strong className="text-text">4. Votem.</strong> Quem acha a IA ganha pontos. O Mestre
            ganha por cada amigo enganado.
          </li>
        </ol>
      </section>

      <p className="mt-10 text-xs text-muted">
        As mensagens do chat são enviadas a um provedor de IA para gerar as falas da IA. Não escreva
        dados pessoais.
      </p>
    </main>
  );
}
