import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Clapperboard, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { Reel } from '../lib/reels';
import { sceneText } from '../lib/reels';
import { SceneView } from './SceneTemplates';
import { useReelClock } from './useReelClock';
import './reels.css';

const HOLD_MS = 220;
const MOVE_PX = 10;
const motionQuery = '(prefers-reduced-motion: reduce)';

interface Props { reel: Reel; reduced: boolean; active?: boolean; onClose?: () => void; onStartUnit: () => void }
export function ReelPlayer({ reel, reduced, active = true, onClose, onStartUnit }: Props) {
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia(motionQuery).matches);
  useEffect(() => {
    const query = window.matchMedia(motionQuery);
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const still = reduced || systemReduced;
  const { stage, view, dispatch } = useReelClock(reel, active, still);
  const press = useRef<{ x: number; y: number; held: boolean; wasPlaying: boolean; timer: number } | null>(null);
  const scene = reel.scenes[view.scene];
  const onControl = (target: EventTarget) => target instanceof Element && !!target.closest('button, a');

  // Short tap by thirds: previous / pause / next. Holding pauses, like stories.
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (onControl(event.target) || event.button !== 0) return;
    const current = { x: event.clientX, y: event.clientY, held: false, wasPlaying: view.playing, timer: 0 };
    current.timer = window.setTimeout(() => { current.held = true; dispatch({ type: 'pause' }); }, HOLD_MS);
    press.current = current;
  }
  function release(event: PointerEvent<HTMLDivElement>, tap: boolean) {
    const current = press.current;
    if (!current) return;
    press.current = null;
    window.clearTimeout(current.timer);
    if (current.held) { if (current.wasPlaying) dispatch({ type: 'play' }); return; }
    if (!tap || Math.hypot(event.clientX - current.x, event.clientY - current.y) > MOVE_PX) return;
    const box = event.currentTarget.getBoundingClientRect();
    const third = (event.clientX - box.left) / box.width;
    dispatch({ type: third < 1 / 3 ? 'prev' : third > 2 / 3 || still ? 'next' : 'toggle' });
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') dispatch({ type: 'next' });
    else if (event.key === 'ArrowLeft') dispatch({ type: 'prev' });
    else if (event.key === ' ' && !onControl(event.target) && !still) dispatch({ type: 'toggle' });
    else return;
    event.preventDefault();
  }
  useEffect(() => () => window.clearTimeout(press.current?.timer), []);

  return <div ref={stage} className="reel-stage" data-still={still} onPointerDown={pointerDown} onPointerUp={event => release(event, true)} onPointerCancel={event => release(event, false)} onPointerLeave={event => release(event, false)} onKeyDown={keyDown}>
    <div className="reel-segments" aria-hidden="true">{reel.scenes.map((_, index) => <span key={index} className="reel-segment"/>)}</div>
    <div className="reel-top"><span className="reel-label"><Clapperboard size={15}/>REEL · UNIDAD {reel.unitId}</span>{onClose && <button className="reel-control" onClick={onClose} aria-label="Cerrar reel" autoFocus><X size={22}/></button>}</div>
    <SceneView key={view.scene} scene={scene} unitId={reel.unitId} actions={<><button className="button warm" onClick={onStartUnit}><Play size={18} fill="currentColor"/>Empezar unidad</button><button className="button outline" onClick={() => dispatch({ type: 'restart' })}><RotateCcw size={17}/>Repetir</button></>}/>
    {active && <p className="sr-only" aria-live="polite">{`Escena ${view.scene + 1} de ${reel.scenes.length}. ${sceneText(scene).join('. ')}`}</p>}
    <div className="reel-controls">
      <button className="reel-control" onClick={() => dispatch({ type: 'prev' })} aria-label="Escena anterior"><ChevronLeft size={24}/></button>
      {!still && <button className="reel-control" onClick={() => dispatch({ type: 'toggle' })} aria-label={view.ended ? 'Repetir reel' : view.playing ? 'Pausar' : 'Reproducir'}>{view.ended ? <RotateCcw size={21}/> : view.playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button>}
      <button className="reel-control" onClick={() => dispatch({ type: 'next' })} aria-label="Escena siguiente" disabled={view.ended}><ChevronRight size={24}/></button>
    </div>
  </div>;
}
