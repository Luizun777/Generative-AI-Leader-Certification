import { useCallback, useEffect, useRef, useState } from 'react';
import rawAudio from '../data/reels-audio.json';
import type { ReelAudioIndex, ReelAudioInfo } from '../lib/reelAudio';
import { audioCommands } from '../lib/reelAudio';
import type { Playback, PlaybackAction, Reel } from '../lib/reels';
import { startPlayback } from '../lib/reels';
import { createReelAudioEngine } from './reelAudioEngine';

const index = rawAudio as ReelAudioIndex;
const asset = (name: string) => `${import.meta.env.BASE_URL}reels-audio/${name}`;
// The picture waits this long for the audio at most; a slow file must not hold the reel back.
const HOLD_MS = 1500;

export const hasNarration = (reel: Reel) => !!index.reels[reel.unitId];

// Loads the reel's audio and turns clock transitions into sound. With sound off nothing is fetched.
export function useReelAudio(reel: Reel, sound: { on: boolean; music: boolean }, still: boolean) {
  const engine = useRef<ReturnType<typeof createReelAudioEngine> | null>(null);
  const last = useRef<Playback>(startPlayback(!still));
  const entry = index.reels[reel.unitId];
  const info = useRef<ReelAudioInfo>({ clips: [], voice: false, effects: false, music: false, still });
  info.current = { clips: entry?.scenes ?? [], voice: sound.on && !!entry, effects: sound.on && !still, music: sound.on && sound.music && !still && !!index.music, still };
  const [ready, setReady] = useState(!sound.on);

  useEffect(() => {
    if (!sound.on) { setReady(true); return; }
    let active = true;
    const current = createReelAudioEngine();
    engine.current = current;
    const timer = window.setTimeout(() => { if (active) setReady(true); }, HOLD_MS);
    void current.load({ voice: entry ? asset(entry.file) : null, music: sound.music && !still && index.music ? asset(index.music.file) : null }).then(loaded => {
      if (!active || !loaded) return;
      window.clearTimeout(timer);
      setReady(true);
      // Opening the reel is the tap that asked for this audio; it joins the picture where it already is.
      current.apply(audioCommands(reel, last.current, last.current, 'start', info.current));
    });
    return () => { active = false; window.clearTimeout(timer); current.close(); engine.current = null; };
  }, [reel, entry, sound.on, sound.music, still]);

  const onTransition = useCallback((prev: Playback, next: Playback, action: PlaybackAction) => {
    last.current = next;
    engine.current?.apply(audioCommands(reel, prev, next, action.type, info.current));
  }, [reel]);
  const replay = useCallback(() => {
    const clip = info.current.voice ? info.current.clips[last.current.scene] : undefined;
    if (clip) engine.current?.apply([{ type: 'voice', offset: clip.start, duration: clip.duration }]);
  }, []);
  return { ready, onTransition, replay };
}
