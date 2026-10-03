import { Preferences } from '@capacitor/preferences';
import { createJsonStore } from './json-store';
import type { KeyValueAdapter } from './json-store';
import type { SoundLevel } from './sound';

const PREFS_KEY = 'pliegue-ia.prefs.v1';
export interface Prefs { v: 1; focus: boolean; sound: 'soft' | 'lively'; muted: boolean; music: boolean; welcomed: boolean }

// Nothing sounds until the person picks a level on the welcome card.
export const defaultPrefs = (): Prefs => ({ v: 1, focus: false, sound: 'soft', muted: true, music: true, welcomed: false });

export function sanitizePrefs(raw: unknown): Prefs {
  const base = defaultPrefs();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const data = raw as Record<string, unknown>;
  const flag = (key: 'focus' | 'muted' | 'music' | 'welcomed') => { const value = data[key]; return typeof value === 'boolean' ? value : base[key]; };
  return { v: 1, focus: flag('focus'), sound: data.sound === 'lively' || data.sound === 'soft' ? data.sound : base.sound, muted: flag('muted'), music: flag('music'), welcomed: flag('welcomed') };
}

export const soundLevel = (prefs: Prefs): SoundLevel => prefs.muted ? 'off' : prefs.sound;
// Muting keeps the chosen level, so the speaker button brings back the same one.
export const withSoundLevel = (prefs: Prefs, level: SoundLevel): Prefs => level === 'off' ? { ...prefs, muted: true } : { ...prefs, muted: false, sound: level };
export const createPrefsStore = (adapter: KeyValueAdapter) => createJsonStore(adapter, PREFS_KEY, sanitizePrefs);

const store = createPrefsStore(Preferences);
export const loadPrefs = store.load;
export const savePrefs = store.save;
