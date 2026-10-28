import { DEFAULT_ROOM_SETTINGS, MATCH_PHASES } from '@quem/shared';
import { GameError } from '../../../shared/game-error';
import { assertTransition, canTransition, nextPhase, phaseDurationMs } from './match-state-machine';

describe('match state machine', () => {
  it('walks the phases in order', () => {
    expect(nextPhase('lobby')).toBe('creation');
    expect(nextPhase('creation')).toBe('conversation');
    expect(nextPhase('conversation')).toBe('voting');
    expect(nextPhase('voting')).toBe('reveal');
  });

  it('has no phase after the reveal', () => {
    expect(() => nextPhase('reveal')).toThrow(GameError);
  });

  it('only allows the single forward transition from each phase', () => {
    for (const from of MATCH_PHASES) {
      for (const to of MATCH_PHASES) {
        const expected = from !== 'reveal' && nextPhase(from) === to;
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });

  it('rejects skipping or going back', () => {
    expect(() => assertTransition('creation', 'voting')).toThrow(GameError);
    expect(() => assertTransition('voting', 'conversation')).toThrow(GameError);
  });

  it('uses the room settings for phase durations', () => {
    const settings = { ...DEFAULT_ROOM_SETTINGS, creationSeconds: 30 };
    expect(phaseDurationMs('creation', settings)).toBe(30_000);
    expect(phaseDurationMs('conversation', settings)).toBe(settings.conversationSeconds * 1000);
    expect(phaseDurationMs('reveal', settings)).toBeNull();
    expect(phaseDurationMs('lobby', settings)).toBeNull();
  });
});
