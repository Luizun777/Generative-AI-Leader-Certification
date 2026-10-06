import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { AudioLines, ChevronLeft, ChevronRight, Clapperboard, Music, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { Reel } from '../lib/reels';
import { sceneText } from '../lib/reels';
import { SceneView } from './SceneTemplates';
import { hasNarration, useReelAudio } from './useReelAudio';
import { useReelClock } from './useReelClock';
import './reels.css';

const HOLD_MS = 220;
const MOVE_PX = 10;
const motionQuery = '(prefers-reduced-motion: reduce)';

// The viewer covers the app's top bar, so it carries its own sound controls.
export interface ReelSound { muted: boolean; music: boolean; onMute: () => void; onMusic: () => void }
interface Props { reel: Reel; reduced: boolean; active?: boolean; sound?: ReelSound; onClose?: () => void; startLabel: string; onStart: () => void }
export function ReelPlayer({ reel, reduced, active = true, sound, onClose, startLabel, onStart }: Props) {
  // A reel made for one lesson is labelled with it; the rest carry their unit.
  const label = reel.lessonId ? `LECCIÓN ${reel.lessonId}` : `UNIDAD ${reel.unitId}`;
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia(motionQuery).matches);
  useEffect(() => {
    const query = window.matchMedia(motionQuery);
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const still = reduced || systemReduced;
  const soundOn = active && !!sound && !sound.muted;
  const narrated = soundOn && hasNarration(reel);
  const audio = useReelAudio(reel, { on: soundOn, music: !!sound?.music }, still);
  const { stage, view, dispatch } = useReelClock(reel, active, still, { hold: !audio.ready, onTransition: audio.onTransition });
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
  // Android keeps the web view running in the background; the page never learns it was hidden.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let gone = false;
    let remove: (() => void) | undefined;
    void import('@capacitor/app').then(({ App }) => App.addListener('pause', () => dispatch({ type: 'pause' }))).then(handle => {
      if (gone) void handle.remove(); else remove = () => { void handle.remove(); };
    });
    return () => { gone = true; remove?.(); };
  }, [dispatch]);

  return <div ref={stage} className="reel-stage" data-still={still} onPointerDown={pointerDown} onPointerUp={event => release(event, true)} onPointerCancel={event => release(event, false)} onPointerLeave={event => release(event, false)} onKeyDown={keyDown}>
    <div className="reel-segments" aria-hidden="true">{reel.scenes.map((_, index) => <span key={index} className="reel-segment"/>)}</div>
    <div className="reel-top" data-muted={!!sound?.muted}><span className="reel-label"><Clapperboard size={15}/><span className="reel-label-kind">REEL · </span>{label}</span><div className="reel-top-actions">
      {sound && !sound.muted && !still && <button className="reel-control reel-music" aria-pressed={sound.music} aria-label="Música" title={sound.music ? 'Música activada' : 'Música desactivada'} onClick={sound.onMusic}><Music size={20}/></button>}
      {/* A reel is made to be heard: while the app is silent the way to turn the sound on is spelled out. */}
      {sound && (sound.muted ? <button className="reel-control reel-unmute" onClick={sound.onMute}><VolumeX size={19}/><span>Activar sonido</span></button>
        : <button className="reel-control" aria-pressed aria-label="Sonido" title="Sonido activado" onClick={sound.onMute}><Volume2 size={21}/></button>)}
      {onClose && <button className="reel-control" onClick={onClose} aria-label="Cerrar reel" autoFocus><X size={22}/></button>}
    </div></div>
    <SceneView key={view.scene} scene={scene} label={label} actions={<><button className="button warm" onClick={onStart}><Play size={18} fill="currentColor"/>{startLabel}</button><button className="button outline" onClick={() => dispatch({ type: 'restart' })}><RotateCcw size={17}/>Repetir</button></>}/>
    {/* With the narration on, the voice already says the scene: announcing its text too would talk over it. */}
    {active && <p className="sr-only" aria-live="polite">{narrated ? `Escena ${view.scene + 1} de ${reel.scenes.length}.` : `Escena ${view.scene + 1} de ${reel.scenes.length}. ${sceneText(scene).join('. ')}`}</p>}
    <div className="reel-controls">
      <button className="reel-control" onClick={() => dispatch({ type: 'prev' })} aria-label="Escena anterior"><ChevronLeft size={24}/></button>
      {!still && <button className="reel-control" onClick={() => dispatch({ type: 'toggle' })} aria-label={view.ended ? 'Repetir reel' : view.playing ? 'Pausar' : 'Reproducir'}>{view.ended ? <RotateCcw size={21}/> : view.playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button>}
      {still && narrated && <button className="reel-control" onClick={audio.replay} aria-label="Escuchar esta escena otra vez"><AudioLines size={21}/></button>}
      <button className="reel-control" onClick={() => dispatch({ type: 'next' })} aria-label="Escena siguiente" disabled={view.ended}><ChevronRight size={24}/></button>
    </div>
  </div>;
}
