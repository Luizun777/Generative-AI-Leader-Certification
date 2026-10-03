import { useEffect, useRef } from 'react';
import type { Reel } from '../lib/reels';
import { ReelPlayer } from './ReelPlayer';
import type { ReelSound } from './ReelPlayer';

export function ReelViewer({ reel, reduced, sound, onClose, onStartUnit }: { reel: Reel; reduced: boolean; sound?: ReelSound; onClose: () => void; onStartUnit: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const modal = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal?.showModal();
    return () => {
      if (modal?.open) modal.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="reel-viewer" aria-label={`Reel de la unidad ${reel.unitId}: ${reel.title}`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <ReelPlayer reel={reel} reduced={reduced} sound={sound} onClose={onClose} onStartUnit={onStartUnit}/>
  </dialog>;
}
