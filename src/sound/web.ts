import type { AudioPort, SoundLevel, SoundName } from '../lib/sound';
import { createSoundPlayer, recipe } from '../lib/sound';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioNavigator = Navigator & { audioSession?: { type: string } };
let context: AudioContext | null = null;
let gate: GainNode | null = null;
let level: SoundLevel = 'off';

// The shared context and its mute gate. Call it from a tap the first time, so browsers let it start.
export function audioOutput(): { context: AudioContext; output: GainNode } | null {
  const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Context) return null;
  try {
    context ??= new Context({ latencyHint: 'interactive' });
    if (!gate) { gate = context.createGain(); gate.gain.value = level === 'off' ? 0 : 1; gate.connect(context.destination); }
  } catch { return null; }
  return { context, output: gate };
}

// Narration is content, not an alert: on iPhone this keeps it audible with the ring switch off.
export function unlockAudio(): void {
  const audio = audioOutput();
  if (!audio) return;
  try { const session = (navigator as AudioNavigator).audioSession; if (session) session.type = 'playback'; } catch { /* older browsers */ }
  if (audio.context.state !== 'running') void audio.context.resume().catch(() => undefined);
}

function openPort(): AudioPort | null {
  const shared = audioOutput();
  if (!shared) return null;
  const audio = shared.context, output = shared.output;
  return {
    get currentTime() { return audio.currentTime; },
    get state() { return audio.state; },
    resume: () => audio.resume(),
    tone(tone, startAt, volume) {
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.freq, startAt);
      if (tone.to) oscillator.frequency.exponentialRampToValueAtTime(tone.to, startAt + tone.dur);
      envelope.gain.setValueAtTime(.0001, startAt);
      envelope.gain.linearRampToValueAtTime(volume, startAt + tone.attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, startAt + tone.dur);
      oscillator.connect(envelope).connect(output);
      oscillator.start(startAt);
      oscillator.stop(startAt + tone.dur + .02);
    },
  };
}

const player = createSoundPlayer({ open: openPort, now: () => performance.now() });
export const play = (name: SoundName) => player.play(name);
export function setSoundLevel(next: SoundLevel) {
  level = next;
  player.setLevel(next);
  // Muting also cuts whatever is still ringing.
  if (context && gate) gate.gain.setValueAtTime(next === 'off' ? 0 : 1, context.currentTime);
}

// Reel effects reuse the recipes without the one-sound-per-tap rule: they follow the picture.
// Their volume is set against the narration they sit under, not against the quiet interface taps.
export function playEffect(name: SoundName, volume: Record<'soft' | 'lively', number>): void {
  if (level === 'off') return;
  const port = openPort();
  if (!port || port.state !== 'running') return;
  const start = port.currentTime + .005;
  for (const tone of recipe(name, level)) port.tone(tone, start + tone.at, volume[level] * tone.gain);
}

// Every control gets its tap from here. The control is read while the event goes down, before React
// re-renders and can detach the clicked node; the sound plays on the way up, after the handlers,
// so one that already played a meaningful sound wins (see createSoundPlayer). Reels keep their own audio.
export function installTapSound(): () => void {
  let pending: SoundName | null = null;
  const onCapture = (event: MouseEvent) => {
    const control = event.target instanceof Element ? event.target.closest('button, summary, input[type=checkbox], input[type=radio]') : null;
    pending = !control || control.matches(':disabled') || control.closest('.reel-viewer, [data-sound="off"]') ? null : control.matches('input') ? 'select' : 'tap';
  };
  const onBubble = () => { if (pending) play(pending); pending = null; };
  const onVisibility = () => { if (document.hidden) void context?.suspend(); else void context?.resume().catch(() => undefined); };
  document.addEventListener('click', onCapture, true);
  document.addEventListener('click', onBubble);
  document.addEventListener('visibilitychange', onVisibility);
  return () => { document.removeEventListener('click', onCapture, true); document.removeEventListener('click', onBubble); document.removeEventListener('visibilitychange', onVisibility); };
}
