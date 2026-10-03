import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import rawOverrides from '../data/lesson-overrides.json';
import type { Copy } from '../lib/copy';
import type { LessonOverrides, LessonStep } from '../lib/lesson-steps';
import { formatFragment, lessonSteps } from '../lib/lesson-steps';
import { play } from '../sound/web';
import type { Lesson } from '../types';
import { Markdown } from '../ui/Markdown';
import './modes.css';

const overrides = rawOverrides as LessonOverrides;
// Pausing a lesson unmounts this screen; the step survives here until the page is reloaded.
const position = new Map<string, { step: number; all: boolean }>();
export const stepCount = (lesson: Lesson) => lessonSteps(lesson, overrides).length;

interface Props { lesson: Lesson; sessionId: string; questions: number; stepped: boolean; header: ReactNode; t: Copy; onStart: () => void }

// The idea before the questions: one long page, or one short card per step in focus mode.
export function LessonIntro({ lesson, sessionId, questions, stepped, header, t, onStart }: Props) {
  const steps = lessonSteps(lesson, overrides);
  const saved = position.get(sessionId);
  const [step, setStep] = useState(Math.min(saved?.step ?? 0, steps.length - 1));
  const [all, setAll] = useState(saved?.all ?? false);
  const title = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => { position.set(sessionId, { step, all }); }, [sessionId, step, all]);
  // The first focus belongs to the page heading; later steps move it to their own title.
  useEffect(() => { if (moved.current) title.current?.focus(); }, [step, all]);
  const go = (next: number) => { moved.current = true; setStep(next); };
  const source = <a href={lesson.sourceUrl} target="_blank" rel="noreferrer" className="source-link">{t.lessonSource}<ExternalLink size={15}/></a>;
  const text = (kind: LessonStep['kind']) => steps.filter(item => item.kind === kind).map(item => item.text);

  if (!stepped || all) {
    const [idea] = text('idea'), points = text('point'), [example] = text('example'), distinctions = text('distinction');
    return <>{header}<article className="lesson-content panel paper">
      <div className="idea-block"><span className="eyebrow">{t.lessonIdea}</span><Markdown>{idea}</Markdown></div>
      {points.length > 0 && <section><h2>{t.lessonPoints}</h2><ul className="key-points">{points.map((point, index) => <li key={index}><span className="point-number">{index + 1}</span><Markdown>{point}</Markdown></li>)}</ul></section>}
      {example && <section className="example-block"><h2>{t.lessonExample}</h2><Markdown>{example}</Markdown></section>}
      {distinctions.length > 0 && <section><h2>{t.lessonDistinctions}</h2><Markdown>{distinctions.join('\n\n')}</Markdown></section>}
      {source}
      <div className="lesson-start"><p>{t.lessonStart(questions)}</p><button className="button blue" onClick={onStart}>{t.lessonStartButton(questions)}</button></div>
      {stepped && <button className="text-button" onClick={() => { moved.current = true; setAll(false); }}>Ver paso a paso</button>}
    </article></>;
  }

  const current = steps[step];
  const last = step === steps.length - 1;
  const { label, items } = formatFragment(current.text);
  const name = current.kind === 'idea' ? t.lessonIdea : current.kind === 'example' ? t.lessonExample : `${current.kind === 'point' ? 'Punto clave' : t.lessonDistinctions}${current.of > 1 ? ` ${current.index} de ${current.of}` : ''}`;
  return <>{header}<article className="lesson-steps panel paper">
    <div className="step-track" aria-hidden="true">{steps.map((_, index) => <span key={index} className={index <= step ? 'done' : ''}/>)}</div>
    <p className="step-count">Paso {step + 1} de {steps.length}</p>
    <section className="step-card">
      <h2 ref={title} tabIndex={-1}>{name}</h2>
      {label && <h3>{label}</h3>}
      {items.length > 1 ? <ul>{items.map((item, index) => <li key={index}><Markdown>{item}</Markdown></li>)}</ul> : <Markdown>{items[0]}</Markdown>}
      {last && <><p className="step-note">{t.lessonStart(questions)}</p>{source}</>}
    </section>
    <div className="step-actions">
      <button className="button outline" disabled={step === 0} onClick={() => go(step - 1)}>Atrás</button>
      <button className="button blue" onClick={() => { if (last) onStart(); else { play('step'); go(step + 1); } }}>{last ? t.lessonStartButton(questions) : 'Siguiente'}</button>
    </div>
    <button className="text-button" onClick={() => { moved.current = true; setAll(true); }}>Ver todo en una página</button>
  </article></>;
}
