import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Reel } from '../lib/reels';
import { reelKey } from '../lib/reels';
import { ReelPlayer } from './ReelPlayer';
import type { ReelSound } from './ReelPlayer';

interface Props { reels: Reel[]; initial: number; reduced: boolean; sound: ReelSound; onClose: () => void; startLabel: (reel: Reel) => string; onStart: (reel: Reel) => void }

// Every reel is one full-height page of a snapping column; only the one on screen plays.
export function ReelFeed({ reels, initial, reduced, sound, onClose, startLabel, onStart }: Props) {
  const column = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
  const [current, setCurrent] = useState(initial);
  const goTo = (index: number) => {
    const target = column.current?.children[Math.min(Math.max(index, 0), reels.length - 1)];
    if (target instanceof HTMLElement) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
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
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown' || event.key === 'PageDown') goTo(current + 1);
    else if (event.key === 'ArrowUp' || event.key === 'PageUp') goTo(current - 1);
    else return;
    event.preventDefault();
  }
  return <section className="reel-feed" aria-label="Reels" tabIndex={-1} ref={root} onKeyDown={keyDown}>
    <div className="reel-feed-column" ref={column}>
      {reels.map((reel, index) => <div key={reelKey(reel)} className="reel-feed-item" data-index={index} aria-hidden={index !== current}>
        {Math.abs(index - current) <= 0 ? <ReelPlayer reel={reel} reduced={reduced} active sound={sound} onClose={onClose} focusClose={false} onEnded={index < reels.length - 1 ? () => goTo(index + 1) : undefined} startLabel={startLabel(reel)} onStart={() => onStart(reel)}/> : <div className="reel-stage reel-feed-idle" aria-hidden="true"><p>{reel.title}</p></div>}
      </div>)}
    </div>
    <div className="reel-feed-nav">
      <span className="reel-feed-count" aria-live="polite">{current + 1} / {reels.length}</span>
      <button className="reel-control" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="Reel anterior"><ChevronUp size={24}/></button>
      <button className="reel-control" onClick={() => goTo(current + 1)} disabled={current === reels.length - 1} aria-label="Reel siguiente"><ChevronDown size={24}/></button>
    </div>
  </section>;
}
