import type { Playback, PlaybackAction, Reel, Scene } from './reels';
import { FPS, LAND_FRAMES, VOICE_FRAME, absoluteFrame, sceneCues } from './reels';

// One narration file per reel; each scene knows where its clip starts and how long it lasts.
export interface VoiceClip { start: number; duration: number; hash: string }
export interface ReelAudioIndex {
  version: 1;
  voice: string | null;
  music: { file: string; seconds: number; bytes: number } | null;
  reels: Record<string, { file: string; bytes: number; scenes: VoiceClip[] }>;
}
export interface ReelAudioInfo { clips: readonly (VoiceClip | undefined)[]; voice: boolean; effects: boolean; music: boolean; still: boolean }
export type AudioCommand =
  | { type: 'voice'; offset: number; duration: number }
  | { type: 'stopVoice' }
  | { type: 'music'; position: number }
  | { type: 'stopMusic'; fade: number }
  | { type: 'land' }
  | { type: 'chime' };
// 'start' is the moment the audio becomes ready, with the reel already open.
export type AudioTrigger = PlaybackAction['type'] | 'start';

const VOICE_TAIL = .4;
const MUSIC_OUT = .8;
const PAUSE_OUT = .05;

export const voiceFits = (scene: Scene, clip: VoiceClip) => VOICE_FRAME / FPS + clip.duration + VOICE_TAIL <= scene.seconds + 1e-9;
export const musicPosition = (reel: Reel, state: Playback) => absoluteFrame(reel, state) / FPS;

// The reel clock stays in charge: every sound is placed from the frame the picture is on,
// so pausing, jumping back or replaying can never drift away from what is shown.
export function audioCommands(reel: Reel, prev: Playback, next: Playback, trigger: AudioTrigger, info: ReelAudioInfo): AudioCommand[] {
  const clip = info.voice ? info.clips[next.scene] : undefined;
  const voiceAt = (frame: number): AudioCommand[] => {
    const elapsed = Math.max(0, frame - VOICE_FRAME) / FPS;
    return clip && elapsed < clip.duration - .05 ? [{ type: 'voice', offset: clip.start + elapsed, duration: clip.duration - elapsed }] : [];
  };
  const music = (): AudioCommand[] => info.music ? [{ type: 'music', position: musicPosition(reel, next) }] : [];

  if (info.still) {
    // Nothing moves in still mode: each scene speaks in full when the person enters it.
    if (trigger === 'pause') return [{ type: 'stopVoice' }];
    if (next.ended || !['start', 'next', 'prev', 'restart'].includes(trigger)) return [];
    return clip ? [{ type: 'voice', offset: clip.start, duration: clip.duration }] : [{ type: 'stopVoice' }];
  }

  if (trigger === 'start') return next.playing ? [...music(), ...(next.frame >= VOICE_FRAME ? voiceAt(next.frame) : [])] : [];

  if (trigger === 'tick') {
    if (!prev.playing || prev === next) return [];
    if (next.ended) return [{ type: 'stopMusic', fade: MUSIC_OUT }];
    const entered = next.scene !== prev.scene;
    const from = entered ? -1 : prev.frame;
    const crossed = (frame: number) => from < frame && frame <= next.frame;
    return [
      ...(entered && info.effects ? [{ type: 'chime' } as const] : []),
      ...(crossed(VOICE_FRAME) ? voiceAt(next.frame) : []),
      ...(info.effects && sceneCues(reel.scenes[next.scene]).some(at => crossed(at + LAND_FRAMES)) ? [{ type: 'land' } as const] : []),
    ];
  }

  if (trigger === 'next' || trigger === 'prev' || trigger === 'restart') {
    if (next.ended) return [{ type: 'stopVoice' }, { type: 'stopMusic', fade: MUSIC_OUT }];
    return [{ type: 'stopVoice' }, ...(info.effects ? [{ type: 'chime' } as const] : []), ...music()];
  }

  // play, pause and toggle
  if (prev.playing && !next.playing) return [{ type: 'stopVoice' }, { type: 'stopMusic', fade: PAUSE_OUT }];
  if (!prev.playing && next.playing) return prev.ended ? [{ type: 'stopVoice' }, ...music()] : [...music(), ...(next.frame >= VOICE_FRAME ? voiceAt(next.frame) : [])];
  return [];
}
