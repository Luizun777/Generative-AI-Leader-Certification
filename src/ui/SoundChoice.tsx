import type { SoundLevel } from '../lib/sound';

const LEVELS: { level: SoundLevel; label: string }[] = [{ level: 'off', label: 'Sin sonido' }, { level: 'soft', label: 'Suave' }, { level: 'lively', label: 'Vivo' }];

export function SoundChoice({ level, disabled = false, onChoose }: { level: SoundLevel; disabled?: boolean; onChoose: (level: SoundLevel) => void }) {
  return <fieldset className="choice-field" disabled={disabled}><legend>Sonido</legend><div className="segmented">{LEVELS.map(item => <button key={item.level} className={level === item.level ? 'selected' : ''} aria-pressed={level === item.level} onClick={() => onChoose(item.level)}>{item.label}</button>)}</div></fieldset>;
}
