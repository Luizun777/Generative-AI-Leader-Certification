import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import type { Lesson, Session, World } from '../types';
import './modes.css';

interface Props {
  header: ReactNode; lesson: Lesson; world: World; steps: number; questions: number; done: number; total: number;
  session: Session | null; sessionLesson?: Lesson; onStart: () => void; onResume: () => void; children: ReactNode;
}

// The focus mode's home: the one next thing to do, its size stated up front, and the whole route one tap away.
export function FocusHome({ header, lesson, world, steps, questions, done, total, session, sessionLesson, onStart, onResume, children }: Props) {
  const complete = done === total;
  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  return <>{header}
    <section className="focus-home panel paper">
      {session ? <>
        <p className="focus-context">{session.mode === 'lesson' ? `Lección ${session.lessonId}` : session.mode === 'exam' ? 'Desafío de 40' : 'Repaso'}</p>
        <h2>{sessionLesson?.title ?? (session.mode === 'exam' ? 'Desafío sin terminar' : 'Repaso sin terminar')}</h2>
        <p className="focus-size">{session.stage === 'results' ? 'Sesión terminada. Tus resultados están listos.' : session.stage === 'intro' ? 'Sesión sin terminar. Tu avance está guardado.' : `Respondiste ${session.responses.length} de ${count(session.questionIds.length, 'pregunta', 'preguntas')}. Tu avance está guardado.`}</p>
        <button className="button blue" onClick={onResume}>{session.stage === 'results' ? 'Ver resultados' : 'Continuar'}</button>
      </> : complete ? <>
        <h2>Completaste las {total} lecciones.</h2>
        <p className="focus-size">Puedes repetir cualquiera desde la ruta.</p>
      </> : <>
        <p className="focus-context">Lección {lesson.id} · Mundo {world.id}: {world.title}</p>
        <h2>{lesson.title}</h2>
        <p className="focus-size">{count(steps, 'paso', 'pasos')} + {count(questions, 'pregunta', 'preguntas')}</p>
        <button className="button blue" onClick={onStart}><Play size={18} fill="currentColor"/>Empezar</button>
      </>}
    </section>
    <details className="route-details" open={complete && !session}><summary>Ver toda la ruta</summary>{children}</details>
  </>;
}
