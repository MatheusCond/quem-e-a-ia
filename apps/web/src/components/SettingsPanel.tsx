import { type RoomSettings, type RoomToggle, TOGGLE_DESCRIPTIONS } from '@quem/shared';
import { useState } from 'react';
import type { Game } from '../lib/useGame';
import { ErrorText, Switch } from './ui';

const DURATIONS: Array<{
  key: 'creationSeconds' | 'conversationSeconds' | 'votingSeconds';
  label: string;
  options: number[];
}> = [
  { key: 'creationSeconds', label: 'Criação da IA', options: [60, 120, 180] },
  { key: 'conversationSeconds', label: 'Conversa', options: [120, 300, 420] },
  { key: 'votingSeconds', label: 'Votação', options: [30, 60, 90] },
];

const TOGGLES = Object.keys(TOGGLE_DESCRIPTIONS) as RoomToggle[];

function label(seconds: number) {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`;
}

/** Mecânicas da sala. Só o anfitrião muda; os outros veem o que está valendo. */
export function SettingsPanel({ game, editable }: { game: Game; editable: boolean }) {
  const settings = game.room!.settings;
  const [error, setError] = useState('');

  async function update(change: Partial<RoomSettings>) {
    setError('');
    const result = await game.send('room:settings', change);
    if (!result.ok) setError(result.error.message);
  }

  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-bold">Regras da sala</h2>
      {!editable && <p className="text-sm text-muted">Só o anfitrião muda as regras.</p>}

      <div className="mt-3 space-y-3">
        {DURATIONS.map(({ key, label: title, options }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-[15px]">{title}</span>
            <div className="flex rounded-full bg-night p-1" role="radiogroup" aria-label={title}>
              {options.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settings[key] === value}
                  disabled={!editable}
                  onClick={() => update({ [key]: value })}
                  className={`rounded-full px-3 py-1 text-sm tabular-nums ${settings[key] === value ? 'bg-raised font-semibold text-text' : 'text-muted'}`}
                >
                  {label(value)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-line">
        {TOGGLES.map((key) => (
          <li key={key} className="flex items-start gap-3 py-3">
            <div className="flex-1">
              <div className="text-[15px] font-medium">{TOGGLE_DESCRIPTIONS[key].title}</div>
              <div className="text-sm text-muted">{TOGGLE_DESCRIPTIONS[key].description}</div>
            </div>
            <Switch
              label={TOGGLE_DESCRIPTIONS[key].title}
              checked={settings[key]}
              disabled={!editable}
              onChange={(value) => update({ [key]: value })}
            />
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}
