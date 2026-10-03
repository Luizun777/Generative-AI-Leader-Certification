import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playback, PlaybackAction, Reel } from '../lib/reels';
import { absoluteFrame, advanceClock, segmentFill, startPlayback, step } from '../lib/reels';

// Paper "boil": every third frame the layers land a hair off, like a hand-placed cut-out.
const BOIL = [[0, 0, 0], [.6, -.4, .15], [-.5, .5, -.2], [.3, .6, .1], [-.6, -.3, -.1], [.5, .2, .2], [-.2, -.6, -.15], [.4, -.5, .05]];
const POSTER_FRAME = 999;

interface ClockOptions {
  // While true the reel waits on its first frame, so picture and narration start together.
  hold?: boolean;
  // Called on every state change, ticks included: the sound follows the clock, never the other way round.
  onTransition?: (prev: Playback, next: Playback, action: PlaybackAction) => void;
}

// One rAF clock quantized to 12 fps drives the whole stage through CSS variables;
// React only re-renders when the scene or the play state changes.
export function useReelClock(reel: Reel, active: boolean, reduced: boolean, { hold = false, onTransition }: ClockOptions = {}) {
  const stage = useRef<HTMLDivElement>(null);
  const playback = useRef<Playback>(startPlayback(!reduced));
  const listener = useRef(onTransition);
  const [view, setView] = useState(playback.current);
  useEffect(() => { listener.current = onTransition; });

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
    const prev = playback.current;
    const next = step(prev, reel, action);
    playback.current = next;
    paint();
    listener.current?.(prev, next, action);
    setView(current => current.scene === next.scene && current.playing === next.playing && current.ended === next.ended ? current : next);
  }, [reel, paint]);

  useLayoutEffect(paint, [paint, view.scene]);
  useEffect(() => { if (reduced) dispatch({ type: 'pause' }); }, [reduced, dispatch]);
  // A reel never keeps talking from a tab or an app that is no longer on screen.
  useEffect(() => {
    const onHide = () => { if (document.hidden) dispatch({ type: 'pause' }); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [dispatch]);
  useEffect(() => {
    if (!active || reduced || hold || !view.playing) return;
    let request = 0;
    let last = performance.now();
    let rest = 0;
    const loop = (now: number) => {
      const clock = advanceClock(rest, now - last);
      last = now; rest = clock.restMs;
      if (clock.frames) dispatch({ type: 'tick', frames: clock.frames });
      request = requestAnimationFrame(loop);
    };
    request = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(request);
  }, [active, reduced, hold, view.playing, dispatch]);

  return { stage, view, dispatch };
}
