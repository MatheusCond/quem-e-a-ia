import { DEFAULT_ROOM_SETTINGS, sanitizeRoomSettings } from './room-settings';

describe('sanitizeRoomSettings', () => {
  it('returns the defaults for garbage input', () => {
    expect(sanitizeRoomSettings(null)).toEqual(DEFAULT_ROOM_SETTINGS);
    expect(sanitizeRoomSettings('hello')).toEqual(DEFAULT_ROOM_SETTINGS);
  });

  it('clamps durations to the allowed range', () => {
    const settings = sanitizeRoomSettings({ conversationSeconds: 5, votingSeconds: 9999 });
    expect(settings.conversationSeconds).toBe(20);
    expect(settings.votingSeconds).toBe(180);
  });

  it('ignores unknown keys and non-boolean toggles', () => {
    const settings = sanitizeRoomSettings({ voteLock: 'yes', mirrorMode: true, hacked: true });
    expect(settings.voteLock).toBe(DEFAULT_ROOM_SETTINGS.voteLock);
    expect(settings.mirrorMode).toBe(true);
    expect(settings).not.toHaveProperty('hacked');
  });

  it('keeps previous values when merging a partial update', () => {
    const base = { ...DEFAULT_ROOM_SETTINGS, secretAiCount: true };
    expect(sanitizeRoomSettings({ voteLock: true }, base)).toMatchObject({
      secretAiCount: true,
      voteLock: true,
    });
  });
});
