import { useEffect, useMemo, useRef, useState } from 'react';
import { answerRound, currentCard, deckCounts, emptyCards, gradeCard, isRepeat, loadCards, pickRound, roundPosition, saveCards, startRound } from '../lib/cards';
import type { CardRound, CardsState, GlossaryCard } from '../lib/cards';
import { play } from '../sound/web';
import './modes.css';

interface Props { deck: GlossaryCard[]; focus: boolean; onStudy: () => void; onRound: (active: boolean) => void }
const SIZES = [5, 10, 20];

// A term, a moment to recall it, and the definition on the other side. The person grades each card;
// the marks decide which cards come first next time and stay on this device.
export function Flashcards({ deck, focus, onStudy, onRound }: Props) {
  const byId = useMemo(() => new Map(deck.map(card => [card.id, card])), [deck]);
  const [marks, setMarks] = useState<CardsState | null>(null);
  const [size, setSize] = useState(focus ? 5 : 10);
  const [round, setRound] = useState<CardRound | null>(null);
  const [turned, setTurned] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => { let active = true; void loadCards().then(saved => { if (active) setMarks(saved); }); return () => { active = false; }; }, []);
  useEffect(() => { if (moved.current) title.current?.focus(); }, [round, turned]);
  useEffect(() => () => onRound(false), []);

  const state = marks ?? emptyCards();
  const start = () => { moved.current = true; setRound(startRound(pickRound(deck, state, size))); setTurned(false); onRound(true); };
  const leave = () => { moved.current = true; setRound(null); onRound(false); };

  if (!round) {
    const counts = deckCounts(deck, state);
    return <section className="panel paper round-intro">
      <h2 ref={title} tabIndex={-1}>Tarjetas de memoria</h2>
      <p>Lees un término, piensas su definición y giras la tarjeta para comprobarla. Tú decides si la sabías.</p>
      <p className="round-counts">{counts.total} tarjetas · {counts.known} sabidas · {counts.missed} por repasar</p>
      <fieldset className="choice-field"><legend>¿Cuántas tarjetas?</legend><div className="segmented">{SIZES.map(count => <button key={count} className={size === count ? 'selected' : ''} aria-pressed={size === count} onClick={() => setSize(count)}>{count} tarjetas</button>)}</div></fieldset>
      <p className="helper">Primero salen las que no sabías, después las nuevas. No suma XP. Se guardan solo en este dispositivo.</p>
      <button className="button blue" onClick={start} disabled={!marks}>Empezar</button>
    </section>;
  }

  const id = currentCard(round);
  if (id === undefined) {
    const missed = round.missed.map(item => byId.get(item)!);
    return <section className="panel paper round-done">
      <h2 ref={title} tabIndex={-1}>Ronda terminada.</h2>
      <p className="round-score">Sabías {round.total - missed.length} de {round.total} tarjetas.</p>
      {missed.length > 0 && <><h3>Para repasar</h3><ul className="round-misses">{missed.map(card => <li key={card.id}><strong>{card.term}</strong><p>{card.definition}</p></li>)}</ul></>}
      <div className="round-actions"><button className="button outline" onClick={leave}>Terminar</button><button className="button blue" onClick={start}>Otra ronda</button></div>
    </section>;
  }

  const card = byId.get(id)!;
  const again = isRepeat(round);
  const turn = () => { moved.current = true; play('flip'); setTurned(true); };
  const grade = (knew: boolean) => {
    moved.current = true;
    // Only the first answer of the round moves the card: knowing it right after reading it does not count.
    if (!again) { const next = gradeCard(state, id, knew); setMarks(next); void saveCards(next); }
    if (round.at === 0) onStudy();
    const after = answerRound(round, knew);
    if (currentCard(after) === undefined) play('complete');
    setRound(after); setTurned(false);
  };

  return <section className="panel paper round">
    <div className="round-top"><p className="step-count">Tarjeta {roundPosition(round)} de {round.total}{again ? ' · otra vez' : ''}</p><button className="text-button" onClick={leave}>Salir de la ronda</button></div>
    <div className={`flashcard ${turned ? 'is-turned' : ''}`}>
      <h2 ref={title} tabIndex={-1}>{card.term}</h2>
      {!turned ? <p className="flashcard-hint">{again ? 'Esta no la sabías. Piensa la definición otra vez.' : 'Piensa la definición. Después gira la tarjeta.'}</p> : <>
        <p className="flashcard-definition">{card.definition}</p>
        <dl className="flashcard-facts"><div><dt>En inglés</dt><dd lang="en">{card.english}</dd></div>{card.variant && <div><dt>En la guía del examen</dt><dd>{card.variant}</dd></div>}<div><dt>{card.lessons.length > 1 ? 'Lecciones' : 'Lección'}</dt><dd>{card.lessons.join(' y ')}</dd></div></dl>
      </>}
    </div>
    {!turned ? <button className="button blue round-turn" onClick={turn}>Girar tarjeta</button>
      : <div className="round-actions"><button className="button outline" onClick={() => grade(false)}>No la sabía</button><button className="button blue" onClick={() => grade(true)}>La sabía</button></div>}
  </section>;
}
