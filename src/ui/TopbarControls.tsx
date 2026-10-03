import { Volume2, VolumeX } from 'lucide-react';

// Both states show in shape, not only in color: the switch thumb moves and the speaker icon changes.
export function TopbarControls({ muted, focus, onMute, onFocus }: { muted: boolean; focus: boolean; onMute: () => void; onFocus: () => void }) {
  return <div className="topbar-controls">
    <button className="focus-switch" role="switch" aria-checked={focus} aria-label="Modo enfoque" title="Una cosa por pantalla, texto directo y sin animaciones" onClick={onFocus}><span className="switch-track" aria-hidden="true"><span className="switch-thumb"/></span><span className="focus-long" aria-hidden="true">Modo enfoque</span><span className="focus-short" aria-hidden="true">Enfoque</span></button>
    <button className="icon-button sound-toggle" aria-pressed={!muted} aria-label="Sonido" title={muted ? 'Sonido desactivado' : 'Sonido activado'} onClick={onMute}>{muted ? <VolumeX size={21}/> : <Volume2 size={21}/>}</button>
  </div>;
}
