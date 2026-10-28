import { DEFAULT_ROOM_SETTINGS } from '@quem/shared';
import { seededRandom } from '../../../shared/random';
import { humanDelayMs, truncateForChat, typingDurationMs } from './chat-rules';

const on = { ...DEFAULT_ROOM_SETTINGS, typingAndDelay: true };
const off = { ...DEFAULT_ROOM_SETTINGS, typingAndDelay: false };

describe('chat timing', () => {
  it('types longer messages for longer', () => {
    const short = typingDurationMs('oi', on, seededRandom(1));
    const long = typingDurationMs('a'.repeat(100), on, seededRandom(1));
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(9000);
    expect(short).toBeGreaterThanOrEqual(1500);
  });

  it('removes every delay when the mechanic is off', () => {
    expect(typingDurationMs('qualquer texto', off, seededRandom(1))).toBe(0);
    expect(humanDelayMs(off, seededRandom(1))).toBe(0);
  });

  it('delays human messages a little when the mechanic is on', () => {
    for (let seed = 0; seed < 20; seed++) {
      const delay = humanDelayMs(on, seededRandom(seed));
      expect(delay).toBeGreaterThanOrEqual(400);
      expect(delay).toBeLessThanOrEqual(2200);
    }
  });
});

describe('truncateForChat', () => {
  it('keeps short texts and cuts long ones on a word boundary', () => {
    expect(truncateForChat('oi  tudo   bem', 50)).toBe('oi tudo bem');
    expect(truncateForChat('uma frase bem comprida demais', 20)).toBe('uma frase bem');
  });
});
