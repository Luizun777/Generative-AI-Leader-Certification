import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playback, PlaybackAction, Reel } from '../lib/reels';
import { absoluteFrame, advanceClock, segmentFill, startPlayback, step } from '../lib/reels';

// Paper "boil": every third frame the layers land a hair off, like a hand-placed cut-out.
const BOIL = [[0, 0, 0], [.6, -.4, .15], [-.5, .5, -.2], [.3, .6, .1], [-.6, -.3, -.1], [.5, .2, .2], [-.2, -.6, -.15], [.4, -.5, .05]];
const POSTER_FRAME = 999;

// One rAF clock quantized to 12 fps drives the whole stage through CSS variables;
// React only re-renders when the scene or the play state changes.
export function useReelClock(reel: Reel, active: boolean, reduced: boolean) {
  const stage = useRef<HTMLDivElement>(null);
  const playback = useRef<Playback>(startPlayback(!reduced));
  const [view, setView] = useState(playback.current);

  const paint = useCallback(() => {
    const element = stage.current;
    if (!element) return;
    const state = playback.current;
    const still = reduced || !active;
    const [x, y, r] = still ? BOIL[0] : BOIL[Math.floor(absoluteFrame(reel, state) / 3) % BOIL.length];
    element.style.setProperty('--f', String(still ? POSTER_FRAME : state.frame));
    element.style.setProperty('--jx', String(x));
    element.style.setProperty('--jy', String(y));
    element.style.setProperty('--jr', String(r));
    const fill = segmentFill(reel, state);
    element.querySelectorAll<HTMLElement>('.reel-segment').forEach((segment, index) => segment.style.setProperty('--p', String(reduced && index === state.scene ? 1 : fill[index] ?? 0)));
  }, [reel, active, reduced]);

  const dispatch = useCallback((action: PlaybackAction) => {
    const next = step(playback.current, reel, action);
    playback.current = next;
    paint();
    setView(current => current.scene === next.scene && current.playing === next.playing && current.ended === next.ended ? current : next);
  }, [reel, paint]);

  useLayoutEffect(paint, [paint, view.scene]);
  useEffect(() => { if (reduced) dispatch({ type: 'pause' }); }, [reduced, dispatch]);
  useEffect(() => {
    if (!active || reduced || !view.playing) return;
    let request = 0;
    let last = performance.now();
    let rest = 0;
    const loop = (now: number) => {
      const clock = advanceClock(rest, now - last);
      last = now; rest = clock.restMs;
      if (clock.frames) dispatch({ type: 'tick', frames: clock.frames });
      request = requestAnimationFrame(loop);
    };
    const resume = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', resume);
    request = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(request); document.removeEventListener('visibilitychange', resume); };
  }, [active, reduced, view.playing, dispatch]);

  return { stage, view, dispatch };
}
