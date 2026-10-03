import type { SoundLevel } from '../lib/sound';
import { SoundChoice } from './SoundChoice';

interface Props { level: SoundLevel; focus: boolean; onSound: (level: SoundLevel) => void; onFocus: (value: boolean) => void; onDone: () => void }

// Shown once above the route: the first sound anyone hears is one they asked for,
// and the simpler screen is offered to everyone instead of being hidden in settings.
export function WelcomeCard({ level, focus, onSound, onFocus, onDone }: Props) {
  return <section className="welcome-card panel paper" aria-labelledby="welcome-title">
    <h2 id="welcome-title">Antes de empezar</h2>
    <p>Elige cómo quieres estudiar. Puedes cambiarlo cuando quieras en «Mi progreso».</p>
    <SoundChoice level={level} onChoose={onSound}/>
    <p className="helper">Nada suena hasta que eliges Suave o Vivo. Al elegir oirás una muestra.</p>
    <label className="check-setting"><input type="checkbox" role="switch" checked={focus} onChange={event => onFocus(event.target.checked)}/><span><strong>Modo enfoque</strong><small>Una cosa por pantalla, texto directo y sin animaciones.</small></span></label>
    <button className="button blue" onClick={onDone}>Listo</button>
  </section>;
}
