import { type RoomSettings, type RoomToggle, TOGGLE_DESCRIPTIONS } from '@quem/shared';
import { useState } from 'react';
import type { Game } from '../lib/useGame';
import { ErrorText, Switch } from './ui';

type DurationKey = 'creationSeconds' | 'conversationSeconds' | 'votingSeconds';

const DURATIONS: Array<{ key: DurationKey; label: string; options: number[] }> = [
  { key: 'creationSeconds', label: 'Criação da IA', options: [60, 120, 180] },
  { key: 'conversationSeconds', label: 'Conversa', options: [120, 300, 420] },
  { key: 'votingSeconds', label: 'Votação', options: [30, 60, 90] },
];

const TOGGLES = Object.keys(TOGGLE_DESCRIPTIONS) as RoomToggle[];

function durationLabel(seconds: number) {
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
    <div>
      <h3 className="text-sm font-semibold text-muted">Tempo de cada fase</h3>
      <div className="mt-2 space-y-2.5">
        {DURATIONS.map(({ key, label, options }) => {
          // Uma duração fora das opções (definida pela API) também aparece marcada.
          const values = options.includes(settings[key])
            ? options
            : [...options, settings[key]].sort((a, b) => a - b);
          return (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
            >
              <span id={`dur-${key}`} className="text-[15px] whitespace-nowrap">
                {label}
              </span>
              <div
                className="flex rounded-full bg-ink p-1"
                role="radiogroup"
                aria-labelledby={`dur-${key}`}
              >
                {values.map((value) => {
                  const active = settings[key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!editable}
                      onClick={() => update({ [key]: value })}
                      className={`rounded-full px-2.5 py-1.5 text-sm whitespace-nowrap tabular-nums transition-colors ${active ? 'bg-raised font-semibold text-text' : 'text-muted enabled:hover:text-text'}`}
                    >
                      {durationLabel(value)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-muted">Mecânicas</h3>
      <ul className="mt-1 divide-y divide-line">
        {TOGGLES.map((key) => (
          <li key={key}>
            {/* A linha inteira é clicável: o texto é o rótulo do switch. */}
            <label
              htmlFor={`rule-${key}`}
              className={`flex items-start gap-3 py-3 ${editable ? 'cursor-pointer' : ''}`}
            >
              <span className="flex-1">
                <span className="block text-[15px] font-medium">
                  {TOGGLE_DESCRIPTIONS[key].title}
                </span>
                <span className="block text-sm leading-snug text-muted">
                  {TOGGLE_DESCRIPTIONS[key].description}
                </span>
              </span>
              <Switch
                id={`rule-${key}`}
                label={TOGGLE_DESCRIPTIONS[key].title}
                checked={settings[key]}
                disabled={!editable}
                onChange={(value) => update({ [key]: value })}
              />
            </label>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
