import { useEffect, useMemo, useRef, useState } from 'react';
import { buildRound, judge } from '../lib/yesno';
import type { YesNoItem } from '../lib/yesno';
import { play } from '../sound/web';
import type { Question } from '../types';
import { Markdown } from '../ui/Markdown';
import './modes.css';

interface Props { questions: Question[]; size: number; onStudy: () => void; onRound: (active: boolean) => void }

// One question and one proposed answer at a time: the only decision is whether that answer is right.
// A round keeps no record: it does not touch answers, mistakes or XP.
export function YesNo({ questions, size, onStudy, onRound }: Props) {
  const byId = useMemo(() => new Map(questions.map(question => [question.id, question])), [questions]);
  const [round, setRound] = useState<YesNoItem[] | null>(null);
  const [replies, setReplies] = useState<boolean[]>([]);
  const [checked, setChecked] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  // A new question takes the focus to its top, so reading goes on from the position through the question.
  const top = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);
  useEffect(() => { if (moved.current) (title.current ?? top.current)?.focus(); }, [round, replies.length, checked]);
  useEffect(() => () => onRound(false), []);

  const text = (question: Question, optionId: string) => question.options.find(option => option.id === optionId)?.text ?? '';
  const start = () => { moved.current = true; setRound(buildRound(questions, size)); setReplies([]); setChecked(false); onRound(true); };
  const leave = () => { moved.current = true; setRound(null); onRound(false); };

  if (!round) return <section className="panel paper round-intro">
    <h2 ref={title} tabIndex={-1}>¿Sí o no?</h2>
    <p>Lees una pregunta y una respuesta propuesta. Decides si esa respuesta es correcta.</p>
    <p className="helper">{Math.min(size, questions.length)} preguntas por ronda, sin límite de tiempo. No suma XP ni cambia tu lista de errores.</p>
    <button className="button blue" onClick={start} disabled={!questions.length}>Empezar</button>
  </section>;

  const answered = checked ? replies.length - 1 : replies.length;
  if (answered >= round.length) {
    const right = replies.filter((reply, index) => judge(round[index], reply)).length;
    const misses = round.filter((item, index) => !judge(item, replies[index]));
    return <section className="panel paper round-done">
      <h2 ref={title} tabIndex={-1}>Ronda terminada.</h2>
      <p className="round-score">Acertaste {right} de {round.length}.</p>
      {misses.length > 0 && <><h3>Para repasar</h3><ul className="round-misses">{misses.map(item => { const question = byId.get(item.questionId)!; return <li key={item.questionId}><Markdown>{question.prompt}</Markdown><p className="round-answer"><strong>Respuesta correcta:</strong> {text(question, question.correctIds[0])}</p></li>; })}</ul></>}
      <div className="round-actions"><button className="button outline" onClick={leave}>Terminar</button><button className="button blue" onClick={start}>Otra ronda</button></div>
    </section>;
  }

  const item = round[answered];
  const question = byId.get(item.questionId)!;
  const last = answered === round.length - 1;
  const reply = (saidYes: boolean) => {
    moved.current = true;
    if (!replies.length) onStudy();
    play(judge(item, saidYes) ? 'correct' : 'incorrect');
    setReplies(current => [...current, saidYes]); setChecked(true);
  };
  const next = () => { moved.current = true; if (last) play('complete'); setChecked(false); };

  return <section className="panel paper round">
    <div className="round-top"><p className="step-count" ref={top} tabIndex={-1}>Pregunta {answered + 1} de {round.length}</p><button className="text-button" onClick={leave}>Salir de la ronda</button></div>
    <Markdown className="round-prompt">{question.prompt}</Markdown>
    <div className="proposed"><span className="proposed-label">Respuesta propuesta</span><Markdown>{text(question, item.optionId)}</Markdown></div>
    {!checked ? <>
      <h2 className="round-question">¿Es correcta esta respuesta?</h2>
      <div className="round-actions"><button className="button outline" onClick={() => reply(false)}>No, no es correcta</button><button className="button blue" onClick={() => reply(true)}>Sí, es correcta</button></div>
    </> : <div className={`answer-feedback ${judge(item, replies[answered]) ? 'is-correct' : 'is-learning'}`}>
      <h2 ref={title} tabIndex={-1}>{judge(item, replies[answered]) ? 'Acertaste.' : 'No acertaste.'}</h2>
      <p>{item.truth ? 'La respuesta propuesta es correcta.' : 'La respuesta propuesta no es correcta.'}</p>
      {!item.truth && <p className="round-answer"><strong>La respuesta correcta es:</strong> {text(question, question.correctIds[0])}</p>}
      <p className="why-label">Por qué:</p>
      <Markdown>{question.explanation}</Markdown>
      <button className="button ink" onClick={next}>{last ? 'Ver resultados' : 'Siguiente'}</button>
    </div>}
  </section>;
}
