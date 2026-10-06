import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, ListVideo, RotateCcw, X } from 'lucide-react';
import type { PlaylistWorld, Reel } from '../lib/reels';
import { reelKey } from '../lib/reels';
import { ReelPlayer } from './ReelPlayer';
import type { ReelSound } from './ReelPlayer';

interface Props { reels: Reel[]; playlist: PlaylistWorld[]; initial: number; reduced: boolean; sound: ReelSound; onClose: () => void; startLabel: (reel: Reel) => string; onStart: (reel: Reel) => void }

// Every reel is one full-height page of a snapping column; only the one on screen plays.
export function ReelFeed({ reels, playlist, initial, reduced, sound, onClose, startLabel, onStart }: Props) {
  const column = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  const [current, setCurrent] = useState(initial);
  const [listOpen, setListOpen] = useState(false);
  const listBox = useRef<HTMLDivElement>(null);
  const goTo = (index: number) => {
    const target = column.current?.children[Math.min(Math.max(index, 0), reels.length - 1)];
    if (target instanceof HTMLElement) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  // The playlist jumps without animating: a long scroll through dozens of reels would only be a blur.
  const jump = (index: number) => {
    const target = column.current?.children[index];
    if (target instanceof HTMLElement) { column.current!.scrollTop = target.offsetTop; setCurrent(index); }
    setListOpen(false);
    root.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!listOpen) return;
    listBox.current?.querySelector<HTMLElement>('[aria-current=true]')?.scrollIntoView({ block: 'center' });
    listBox.current?.querySelector<HTMLElement>('.reel-list-close')?.focus();
  }, [listOpen]);
  useLayoutEffect(() => {
    const target = column.current?.children[initial];
    if (target instanceof HTMLElement) column.current!.scrollTop = target.offsetTop;
  }, [initial]);
  useEffect(() => {
    const box = column.current;
    if (!box) return;
    const watch = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.index));
    }, { root: box, threshold: 0.6 });
    Array.from(box.children).forEach(child => watch.observe(child));
    return () => watch.disconnect();
  }, [reels]);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (listOpen) { if (event.key === 'Escape') { setListOpen(false); root.current?.focus({ preventScroll: true }); event.preventDefault(); } return; }
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown' || event.key === 'PageDown') goTo(current + 1);
    else if (event.key === 'ArrowUp' || event.key === 'PageUp') goTo(current - 1);
    else return;
    event.preventDefault();
  }
  return <section className="reel-feed" aria-label="Reels" tabIndex={-1} ref={root} onKeyDown={keyDown}>
    <div className="reel-feed-column" ref={column}>
      {reels.map((reel, index) => <div key={reelKey(reel)} className="reel-feed-item" data-index={index} aria-hidden={index !== current}>
        {Math.abs(index - current) <= 0 ? <ReelPlayer reel={reel} reduced={reduced} active={!listOpen} sound={sound} onClose={onClose} focusClose={false} onEnded={index < reels.length - 1 ? () => goTo(index + 1) : undefined} startLabel={startLabel(reel)} onStart={() => onStart(reel)}/> : <div className="reel-stage reel-feed-idle" aria-hidden="true"><p>{reel.title}</p></div>}
      </div>)}
    </div>
    <button className="reel-control reel-feed-list" onClick={() => setListOpen(true)} aria-label="Lista de reproducción" title="Lista de reproducción"><ListVideo size={22}/></button>
    {listOpen && <div className="reel-list-backdrop" onClick={event => { if (event.target === event.currentTarget) setListOpen(false); }}>
      <div className="reel-list" role="dialog" aria-modal="true" aria-label="Lista de reproducción" ref={listBox}>
        <div className="reel-list-head"><h2>Lista de reproducción</h2><button className="reel-control reel-list-close" onClick={() => setListOpen(false)} aria-label="Cerrar lista"><X size={22}/></button></div>
        <button className="button warm reel-list-start" onClick={() => jump(0)}><RotateCcw size={17}/>Ver todo desde el inicio</button>
        {playlist.map(world => <section key={world.id}><h3 className="reel-list-world">Mundo {String(world.id).padStart(2, '0')} · {world.title}</h3>
          {world.units.map(unit => <div key={unit.id} className="reel-list-unit"><p className="reel-list-unit-title">{unit.id} · {unit.title}</p>
            {unit.items.map(item => <button key={item.index} className="reel-list-item" aria-current={item.index === current} onClick={() => jump(item.index)}><span className="reel-list-tag">{item.tag}</span><span>{item.title}</span></button>)}
          </div>)}</section>)}
      </div>
    </div>}
    <div className="reel-feed-nav">
      <span className="reel-feed-count" aria-live="polite">{current + 1} / {reels.length}</span>
      <button className="reel-control" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="Reel anterior"><ChevronUp size={24}/></button>
      <button className="reel-control" onClick={() => goTo(current + 1)} disabled={current === reels.length - 1} aria-label="Reel siguiente"><ChevronDown size={24}/></button>
    </div>
  </section>;
}
