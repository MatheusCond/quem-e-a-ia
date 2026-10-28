import { type CSSProperties, type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorText, TextInput } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { saveToken } from '../lib/session';

/**
 * Conversa de mentira no topo: é o jogo explicado sem palavras. Toca uma
 * vez ao abrir a página: as mensagens chegam, a última é grifada e ganha
 * a interrogação.
 */
const PREVIEW = [
  { who: 'Capivara Zen', color: '#2a9d8f', emoji: '🦊', text: 'gente quem comeu meu pastel ontem' },
  { who: 'Tatu-Bola', color: '#8e6bd9', emoji: '🐢', text: 'kkkkk não fui eu, juro' },
  { who: 'Coxinha Astral', color: '#e76f51', emoji: '🐙', text: 'eu nem gosto de pastel 🙄' },
];
const SUSPECT = PREVIEW.length - 1;

const STEPS = [
  {
    title: 'Chame o grupo',
    text: 'Crie a sala e mande o link no WhatsApp. Cada um entra pelo navegador do celular.',
  },
  {
    title: 'Alguém vira Mestre, em segredo',
    text: 'Em 2 minutos, ele ensina a IA a falar como ele: gírias, manias, piadas internas.',
  },
  {
    title: 'Conversem',
    text: 'Todo mundo aparece com nome e avatar sorteados. No lugar do Mestre, quem fala é a IA.',
  },
  {
    title: 'Votem',
    text: 'Quem acha a IA ganha pontos. O Mestre ganha por cada amigo enganado.',
  },
];

export function HomeScreen() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const joining = code.trim().length > 0;

  async function enter(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = joining
        ? await api.joinRoom(code.trim().toUpperCase(), nickname)
        : await api.createRoom(nickname);
      saveToken(result.roomCode, result.token);
      navigate(`/sala/${result.roomCode}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo deu errado. Tente de novo.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col px-4 pt-8 pb-12">
      <p className="font-display text-[15px] font-bold text-amber" translate="no">
        Quem é a IA?
      </p>
      <h1 className="mt-3 font-display text-[46px] leading-[0.92] font-extrabold tracking-tight">
        Um de vocês é uma&nbsp;IA.
      </h1>
      <p className="mt-4 max-w-[34ch] text-[17px] leading-relaxed text-muted">
        Um chat em grupo com os amigos, todo mundo com nome falso. Alguém ensinou uma IA a falar
        como gente. Descubram quem é.
      </p>

      <div className="chat-wall mt-7 space-y-2 rounded-3xl border border-line p-4" aria-hidden>
        {PREVIEW.map((m, index) => (
          <div
            key={m.who}
            className="rise flex items-end gap-2"
            style={{ '--rise-delay': `${0.25 + index * 0.55}s` } as CSSProperties}
          >
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
              style={{ background: m.color }}
            >
              {m.emoji}
            </span>
            <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-bubble-in px-3 py-1.5">
              <div className="text-[12.5px] font-semibold" style={{ color: m.color }}>
                {m.who}
              </div>
              <div className="text-[15px]">
                {index === SUSPECT ? (
                  <span className="marker" style={{ '--marker-delay': '2.1s' } as CSSProperties}>
                    {m.text}
                  </span>
                ) : (
                  m.text
                )}
              </div>
            </div>
            {index === SUSPECT && (
              <span
                className="reveal-stamp pb-1 font-display text-3xl leading-none font-extrabold text-amber"
                style={{ '--stamp-delay': '2.6s' } as CSSProperties}
              >
                ?
              </span>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={enter} className="mt-8 space-y-4">
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
            Código da sala <span className="font-normal text-muted">(se alguém te mandou)</span>
          </span>
          <TextInput
            name="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={6}
            placeholder="Ex.: K7QX2M"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-display text-lg tracking-[0.3em] placeholder:font-sans placeholder:text-[16px] placeholder:tracking-normal"
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy
            ? joining
              ? 'Entrando…'
              : 'Criando sala…'
            : joining
              ? 'Entrar na sala'
              : 'Criar sala'}
        </Button>
      </form>

      <section className="mt-12" aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="font-display text-2xl font-bold">
          Como funciona
        </h2>
        <ol className="mt-4 space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised font-display text-sm font-bold text-amber tabular-nums"
              >
                {index + 1}
              </span>
              <p className="text-[15px] leading-relaxed text-muted">
                <strong className="block font-semibold text-text">{step.title}</strong>
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-12 text-xs leading-relaxed text-muted">
        As mensagens do chat são enviadas a um provedor de IA para gerar as falas da IA. Não escreva
        dados pessoais.
      </p>
    </main>
  );
}
