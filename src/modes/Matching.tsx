import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Layers, RotateCcw } from 'lucide-react';
import type { Copy } from '../lib/copy';
import { shuffle } from '../lib/engine';
import { play } from '../sound/web';
import type { MatchingSet } from '../types';

// One set of pairs on the table: the definitions keep their shuffled order until the set starts over.
interface Board { id: string; order: string[]; matched: string[]; selected: string | null; wrong: string | null; notice: string | null; hold: string | null }
const deal = (set: MatchingSet | undefined): Board => ({ id: set?.id ?? '', order: shuffle(set?.pairs ?? []).map(pair => pair.id), matched: [], selected: null, wrong: null, notice: null, hold: null });
// Changing tabs unmounts the screen; the board waits here, so a half-connected set is still there on return.
let kept: Board | null = null;
// After restoring a backup the same set starts over, as if it had just been chosen.
export function restartMatching() { if (kept) kept = { ...kept, order: [], matched: [], selected: null, wrong: null, notice: null, hold: null }; }

interface Props { sets: MatchingSet[]; completed: string[]; focus: boolean; t: Copy; header: ReactNode; fox: ReactNode; onComplete: (id: string) => void }

export function Matching({ sets, completed, focus, t, header, fox, onComplete }: Props) {
  const [board, setBoard] = useState<Board>(() => { kept = kept?.order.length ? kept : deal(sets.find(set => set.id === kept?.id) ?? sets[0]); return kept; });
  const update = (next: Board) => { kept = next; setBoard(next); };
  const set = sets.find(item => item.id === board.id) ?? sets[0];
  const { matched, selected, wrong, notice, hold } = board;
  const complete = matched.length === set.pairs.length;
  // In focus mode the concept to connect is always the next one that is still open.
  const active = focus ? set.pairs.find(pair => !matched.includes(pair.id))?.id ?? null : selected;
  const definitions = board.order.map(id => set.pairs.find(pair => pair.id === id)!);

  function choose(id: string) {
    if (!active || matched.includes(id)) { if (!active) update({ ...board, notice: t.matchPickFirst }); return; }
    if (active !== id) { update({ ...board, wrong: id, notice: t.matchWrong }); play('incorrect'); return; }
    const next = [...matched, id];
    const done = next.length === set.pairs.length;
    play(done ? 'complete' : 'match');
    update({ ...board, matched: next, selected: null, wrong: null, notice: done ? t.matchComplete(next.length) : t.matchRight(next.length, set.pairs.length), hold: !done && focus ? id : null });
    if (done) onComplete(set.id);
  }

  return <>{header}<div className="matching-tabs" aria-label="Conjuntos de parejas">{sets.map((item, index) => <button className={set.id === item.id ? 'selected' : ''} aria-pressed={set.id === item.id} key={item.id} onClick={() => update(deal(item))}>{completed.includes(item.id) ? <Check size={17}/> : <Layers size={17}/>}<span>{index + 1}. {item.title}</span></button>)}</div>
    <section className="panel paper matching-panel"><div className="section-heading"><div><p className="eyebrow">{focus ? 'Unidad' : 'UNIDAD'} {set.unitId}</p><h2>{set.title}</h2></div><span className="count-badge">{matched.length} / {set.pairs.length}</span></div><p>{t.matchingHow}</p>
      <div className="matching-board">{focus ? <div className="match-current"><p className="match-position">Pareja {Math.min(matched.length + (hold || complete ? 0 : 1), set.pairs.length)} de {set.pairs.length}</p><h3>Concepto</h3><strong>{set.pairs.find(pair => pair.id === (hold ?? active ?? matched[matched.length - 1]))?.term}</strong></div>
        : <div className="match-column"><h3>Conceptos</h3>{set.pairs.map(pair => <button key={pair.id} className={`match-card ${matched.includes(pair.id) ? 'matched' : selected === pair.id ? 'selected' : ''}`} disabled={matched.includes(pair.id)} aria-pressed={selected === pair.id} onClick={() => update({ ...board, selected: pair.id, wrong: null, notice: t.matchChosen(pair.term) })}>{matched.includes(pair.id) && <Check size={18}/>}<span>{pair.term}</span>{matched.includes(pair.id) && <span className="sr-only">Conectado</span>}</button>)}</div>}
        <div className="match-column"><h3>Definiciones</h3>{definitions.map(pair => <button key={pair.id} className={`match-card definition ${matched.includes(pair.id) ? 'matched' : wrong === pair.id ? 'wrong' : ''}`} disabled={matched.includes(pair.id) || !!hold} onClick={() => choose(pair.id)}>{matched.includes(pair.id) && <Check size={18}/>}<span>{pair.definition}</span>{matched.includes(pair.id) && <span className="sr-only">Conectada</span>}</button>)}</div></div>
      <div className={`matching-feedback ${complete ? 'complete' : ''}`} role="status">{complete && fox}<p>{notice ?? t.matchStart}</p></div>
      {hold && <button className="button blue" onClick={() => update({ ...board, hold: null, notice: null })}>Siguiente</button>}
      <button className="button outline" onClick={() => update(deal(set))}><RotateCcw size={17}/>{t.matchRepeat}</button>
    </section></>;
}
