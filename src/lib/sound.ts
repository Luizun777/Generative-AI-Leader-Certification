export type SoundName = 'tap' | 'select' | 'step' | 'flip' | 'correct' | 'incorrect' | 'match' | 'complete';
export type SoundLevel = 'off' | 'soft' | 'lively';
// Times in seconds; gain is relative to the level's master gain.
export interface Tone { at: number; freq: number; to?: number; dur: number; attack: number; gain: number; wave: 'sine' | 'triangle' }

export const SOUND_NAMES: readonly SoundName[] = ['tap', 'select', 'step', 'flip', 'correct', 'incorrect', 'match', 'complete'];
export const MASTER_GAIN: Record<Exclude<SoundLevel, 'off'>, number> = { soft: 0.07, lively: 0.18 };

const E4 = 329.63, G4 = 392, A4 = 440, C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
type Note = [at: number, freq: number, dur: number, gain: number, to?: number];
const tones = (wave: Tone['wave'], attack: number, notes: Note[]): Tone[] => notes.map(([at, freq, dur, gain, to]) => ({ at, freq, dur, attack, gain, wave, ...(to ? { to } : {}) }));

// Both levels share the notes, so an action always sounds like itself; lively is louder, brighter and longer.
// The error is one neutral note, never louder than the success.
const RECIPES: Record<Exclude<SoundLevel, 'off'>, Record<SoundName, Tone[]>> = {
  soft: {
    tap: tones('sine', .008, [[0, G4, .035, .35]]),
    select: tones('sine', .008, [[0, C5, .06, .5]]),
    step: tones('sine', .008, [[0, D5, .07, .45]]),
    flip: tones('sine', .01, [[0, A4, .09, .45, D5]]),
    correct: tones('sine', .01, [[0, C5, .08, .8], [.08, G5, .08, .8]]),
    incorrect: tones('sine', .015, [[0, E4, .14, .6]]),
    match: tones('sine', .01, [[0, G4, .11, .42], [0, C5, .11, .42]]),
    complete: tones('sine', .01, [[0, C5, .09, .8], [.09, E5, .09, .8], [.18, G5, .09, .8], [.27, C6, .13, .8]]),
  },
  lively: {
    tap: tones('triangle', .008, [[0, G4, .05, .45]]),
    select: tones('triangle', .008, [[0, C5, .08, .6]]),
    step: tones('triangle', .008, [[0, D5, .09, .55]]),
    flip: tones('triangle', .01, [[0, A4, .12, .55, D5]]),
    correct: tones('triangle', .01, [[0, C5, .1, 1], [0, C5 * 2, .1, .25], [.1, E5, .1, 1], [.1, E5 * 2, .1, .25], [.2, G5, .15, 1], [.2, G5 * 2, .15, .25]]),
    incorrect: tones('triangle', .015, [[0, E4, .18, .7]]),
    match: tones('triangle', .01, [[0, G4, .16, .55], [0, C5, .16, .55]]),
    complete: tones('triangle', .01, [[0, C5, .11, 1], [.11, E5, .11, 1], [.22, G5, .11, 1], [.33, C6, .12, 1], [.45, C5, .35, .4], [.45, E5, .35, .4], [.45, G5, .35, .4], [.45, C6, .35, .4]]),
  },
};

export const recipe = (name: SoundName, level: SoundLevel): readonly Tone[] => level === 'off' ? [] : RECIPES[level][name];
export const recipeSeconds = (list: readonly Tone[]) => list.reduce((end, tone) => Math.max(end, tone.at + tone.dur), 0);

export interface AudioPort {
  readonly currentTime: number;
  readonly state: string;
  resume(): Promise<unknown>;
  tone(tone: Tone, startAt: number, volume: number): void;
}

const AMBIENT: readonly SoundName[] = ['tap', 'select'];
const CUE_WINDOW_MS = 50;
const REPEAT_MS = 40;
const RESUME_MS = 150;

// The port is injected so tests can drive the rules without a browser.
export function createSoundPlayer(deps: { open: () => AudioPort | null; now: () => number }) {
  let port: AudioPort | null = null;
  let level: SoundLevel = 'off';
  let lastCue = -Infinity;
  let lastSound = -Infinity;
  const schedule = (target: AudioPort, list: readonly Tone[], volume: number) => {
    const start = target.currentTime + .005;
    for (const tone of list) target.tone(tone, start + tone.at, volume * tone.gain);
  };
  return {
    setLevel(next: SoundLevel) { level = next; },
    play(name: SoundName): boolean {
      if (level === 'off') return false;
      const now = deps.now();
      const ambient = AMBIENT.includes(name);
      // One sound per action: the generic tap yields to a meaningful sound from the same gesture,
      // and a label that forwards its click to an input does not sound twice.
      if (ambient && (now - lastCue < CUE_WINDOW_MS || now - lastSound < REPEAT_MS)) return false;
      port ??= deps.open();
      if (!port) return false;
      lastSound = now;
      if (!ambient) lastCue = now;
      const target = port, list = recipe(name, level), volume = MASTER_GAIN[level];
      if (target.state === 'running') { schedule(target, list, volume); return true; }
      // A context that starts late must drop the sound instead of playing it out of place.
      void target.resume().then(() => { if (target.state === 'running' && deps.now() - now <= RESUME_MS) schedule(target, list, volume); }, () => undefined);
      return true;
    },
  };
}
