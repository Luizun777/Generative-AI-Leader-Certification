import type { SoundLevel, SoundName } from '../lib/sound';
import { SoundChoice } from './SoundChoice';

const SAMPLES: { name: SoundName; label: string }[] = [
  { name: 'tap', label: 'Toque' }, { name: 'select', label: 'Elegir opción' }, { name: 'step', label: 'Paso siguiente' }, { name: 'flip', label: 'Girar tarjeta' },
  { name: 'correct', label: 'Acierto' }, { name: 'incorrect', label: 'Error' }, { name: 'match', label: 'Pareja' }, { name: 'complete', label: 'Completado' },
];
interface Props {
  focus: boolean; level: SoundLevel; music: boolean; reducedMotion: boolean; disabled: boolean;
  onFocus: (value: boolean) => void; onSound: (level: SoundLevel) => void; onSample: (name: SoundName) => void; onMusic: (value: boolean) => void; onReducedMotion: (value: boolean) => void;
}

export function PacePanel({ focus, level, music, reducedMotion, disabled, onFocus, onSound, onSample, onMusic, onReducedMotion }: Props) {
  return <>
    <label className="check-setting"><input type="checkbox" role="switch" checked={focus} onChange={event => onFocus(event.target.checked)}/><span><strong>Modo enfoque</strong><small>Muestra una cosa por pantalla. Usa texto directo. Quita animaciones y contadores. No cambia tus lecciones ni tu avance.</small></span></label>
    <details className="focus-changes"><summary>Qué cambia</summary><ul>
      <li>El inicio muestra solo tu siguiente paso.</li>
      <li>Las lecciones se leen paso a paso.</li>
      <li>Después de cada respuesta ves si es correcta y por qué.</li>
      <li>La racha y los XP solo aparecen en «Mi progreso».</li>
      <li>Los reels avanzan a mano y suenan solo con voz.</li>
      <li>El nivel de sonido no cambia.</li>
    </ul></details>
    <SoundChoice level={level} onChoose={onSound}/>
    <p className="helper">Suave usa toques discretos; Vivo, sonidos más brillantes. Los reels se narran con cualquiera de los dos. El botón del altavoz, arriba, lo silencia todo.</p>
    <details className="sound-samples"><summary>Escuchar los sonidos</summary>
      {level === 'off' ? <p className="small-note">Elige Suave o Vivo para escucharlos.</p>
        : <div className="sample-grid" data-sound="off">{SAMPLES.map(sample => <button key={sample.name} className="button outline" onClick={() => onSample(sample.name)}>{sample.label}</button>)}</div>}
    </details>
    <label className="check-setting"><input type="checkbox" checked={music && !focus} disabled={focus} onChange={event => onMusic(event.target.checked)}/><span><strong>Música en los reels</strong><small>{focus ? 'Con el modo enfoque los reels suenan solo con voz.' : 'Suena baja, por debajo de la voz. Sin ella quedan la voz y los efectos.'}</small></span></label>
    <label className="check-setting"><input type="checkbox" checked={reducedMotion || focus} disabled={disabled || focus} onChange={event => onReducedMotion(event.target.checked)}/><span><strong>Reducir movimiento</strong><small>{focus ? 'El modo enfoque ya reduce el movimiento.' : 'Desactiva rebotes y movimientos del personaje. Los reels avanzan a mano y solo con voz.'}</small></span></label>
    <p className="helper">También respetamos la preferencia de movimiento reducido de tu dispositivo.</p>
    <p className="small-note">El modo enfoque, el sonido y la música se guardan solo en este dispositivo; no viajan en el respaldo.</p>
  </>;
}
