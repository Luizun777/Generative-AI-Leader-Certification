import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowLeft, BookOpen, Bot, Brain, Briefcase, Check, CheckCircle2, ChevronRight, Clapperboard, Download, ExternalLink, Flag, Flame, Layers, LoaderCircle, MessageCircle, Play, RotateCcw, Settings, ShieldCheck, Shuffle, Sparkles, Upload, WifiOff, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rawCurriculum from './data/curriculum.json';
import rawReels from './data/reels.json';
import type { Curriculum, Lesson, Progress, Session, SessionMode, Unit } from './types';
import { completeLesson, newProgress, parseBackup, recordAnswer, selectQuestions, shuffle, startSession } from './lib/engine';
import { firstPendingLesson } from './lib/reels';
import type { ReelSet } from './lib/reels';
import { exportBackup, loadProgress, restoreProgress, saveProgress } from './lib/storage';
import { ReelViewer } from './reels/ReelViewer';
import { registerStudyTools } from './webmcp';

const curriculum = rawCurriculum as Curriculum;
const reelByUnit = new Map((rawReels as ReelSet).reels.map(reel => [reel.unitId, reel]));
const questionById = new Map(curriculum.questions.map(question => [question.id, question]));
const lessonById = new Map(curriculum.lessons.map(lesson => [lesson.id, lesson]));
const practiceQuestions = curriculum.questions.filter(question => !question.exam);
const examQuestions = curriculum.questions.filter(question => question.exam);
const worldIcons = [Briefcase, Brain, Layers, MessageCircle, Bot];
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;
type Page = 'learn' | 'quick' | 'matching' | 'exam' | 'progress' | 'session';
const navigation: { page: Page; label: string; short: string; Icon: typeof BookOpen }[] = [
  { page: 'learn', label: 'Aprender', short: 'Aprender', Icon: BookOpen },
  { page: 'quick', label: 'Repaso rápido', short: 'Repasar', Icon: Shuffle },
  { page: 'matching', label: 'Conecta ideas', short: 'Conectar', Icon: Layers },
  { page: 'exam', label: 'Desafío final', short: 'Desafío', Icon: Flag },
  { page: 'progress', label: 'Mi progreso', short: 'Progreso', Icon: Settings },
];
function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function shownStreak(progress: Progress) {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  return [localDay(), localDay(yesterday)].includes(progress.streak.lastStudyDate ?? '') ? progress.streak.current : 0;
}
function plural(count: number, singular: string, multiple: string) { return count === 1 ? singular : multiple; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Ocurrió un problema. Inténtalo de nuevo.'; }
function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return <div className={`markdown ${className}`}><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children: text, ...props }) => <a {...props} target="_blank" rel="noreferrer">{text}</a>, table: ({ children: rows, ...props }) => <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla de contenido, desplazable horizontalmente"><table {...props}>{rows}</table></div> }}>{children}</ReactMarkdown></div>;
}
function Fox({ mood = 'calm', className = '' }: { mood?: 'calm' | 'celebrate' | 'encourage'; className?: string }) {
  return <img className={`fox fox-${mood} ${className}`} src={asset(`art/fox-${mood}.png`)} alt="" aria-hidden="true" />;
}
function Confirmation({ title, children, confirm, onConfirm, onCancel, busy = false }: { title: string; children: ReactNode; confirm: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
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
  return <dialog ref={dialog} className="confirmation paper" aria-labelledby="confirmation-title" onCancel={event => { if (busy) event.preventDefault(); else onCancel(); }}>
    <h2 id="confirmation-title">{title}</h2><div>{children}</div>
    <div className="button-row"><button className="button outline" onClick={onCancel} disabled={busy} autoFocus>Cancelar</button><button className="button blue" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinning" size={18}/> : null}{confirm}</button></div>
  </dialog>;
}

export default function App() {
  const [progress, setProgress] = useState<Progress>(() => newProgress(curriculum.version));
  const progressRef = useRef(progress);
  const storageReady = useRef(false);
  const saveRevision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState<Page>('learn');
  const [worldId, setWorldId] = useState(curriculum.worlds[0].id);
  const [quickCount, setQuickCount] = useState(5);
  const [quickUnit, setQuickUnit] = useState('all');
  const [mistakesOnly, setMistakesOnly] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [reelUnit, setReelUnit] = useState<Unit | null>(null);
  const [pendingImport, setPendingImport] = useState<{ progress: Progress; name: string } | null>(null);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importReading, setImportReading] = useState(false);
  const importReadRevision = useRef(0);
  const [exportBusy, setExportBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(document.documentElement.dataset.offlineReady === 'true');
  const [matchId, setMatchId] = useState(curriculum.matches[0]?.id ?? '');
  const [matched, setMatched] = useState<string[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [wrongDefinition, setWrongDefinition] = useState<string | null>(null);
  const [matchNotice, setMatchNotice] = useState('Elige un concepto y después su definición.');
  const [matchRound, setMatchRound] = useState(0);
  const mainHeading = useRef<HTMLHeadingElement>(null);
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const session = progress.activeSession;
  const sessionLesson = session?.lessonId ? lessonById.get(session.lessonId) : undefined;
  const currentQuestion = session ? questionById.get(session.questionIds[session.index]) : undefined;
  const nextLesson = curriculum.lessons.find(lesson => !progress.completedLessons.includes(lesson.id)) ?? curriculum.lessons[0];
  const currentWorld = curriculum.worlds.find(world => world.id === worldId)!;
  const nextWorld = curriculum.worlds.find(world => world.id === nextLesson.worldId)!;
  const matchingSet = curriculum.matches.find(match => match.id === matchId);
  const definitions = useMemo(() => shuffle(matchingSet?.pairs ?? []), [matchingSet, matchRound]);
  const mistakeCount = practiceQuestions.filter(question => progress.answers[question.id]?.lastCorrect === false).length;
  const eligibleQuick = practiceQuestions.filter(question => (quickUnit === 'all' || question.unitId === quickUnit) && (!mistakesOnly || progress.answers[question.id]?.lastCorrect === false));
  const answerStats = Object.values(progress.answers).reduce((total, answer) => ({ attempts: total.attempts + answer.attempts, correct: total.correct + answer.correct }), { attempts: 0, correct: 0 });
  const activePage = page === 'session' ? session?.mode === 'exam' ? 'exam' : session?.mode === 'quick' ? 'quick' : 'learn' : page;
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    let active = true;
    loadProgress(curriculum).then(saved => {
      if (!active) return;
      progressRef.current = saved; storageReady.current = true; setProgress(saved);
      const upcoming = curriculum.lessons.find(lesson => !saved.completedLessons.includes(lesson.id));
      if (upcoming) setWorldId(upcoming.worldId);
    }).catch(error => { if (active) { setLoadFailure(errorText(error)); setPage('progress'); } }).finally(() => { if (active) setLoading(false); });
    const updateOnline = () => setOnline(navigator.onLine);
    const updateOfflineReady = () => setOfflineReady(document.documentElement.dataset.offlineReady === 'true');
    updateOfflineReady();
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);
    window.addEventListener('pliegue-offline-ready', updateOfflineReady);
    return () => { active = false; window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); window.removeEventListener('pliegue-offline-ready', updateOfflineReady); };
  }, []);
  useEffect(() => registerStudyTools(() => storageReady.current ? progressRef.current : null, () => { setPage('quick'); setNotice(''); }), []);
  useEffect(() => { if (!loading) mainHeading.current?.focus(); }, [page, loading]);
  useEffect(() => {
    if (page !== 'session') return;
    if (session?.stage === 'feedback') feedbackHeading.current?.focus();
    else mainHeading.current?.focus();
  }, [page, session?.stage, session?.index]);

  function persist(value: Progress) {
    const revision = ++saveRevision.current;
    setSaving(true); setSaveFailure(null);
    void saveProgress(value).then(() => { if (revision === saveRevision.current) setSaving(false); }).catch(error => {
      if (revision === saveRevision.current) { setSaving(false); setSaveFailure(errorText(error)); }
    });
  }
  function changeProgress(update: (current: Progress) => Progress) {
    if (!storageReady.current) return;
    const previous = progressRef.current;
    const next = update(previous);
    if (previous === next) return;
    progressRef.current = next; setProgress(next); persist(next);
  }
  function navigate(next: Page) { setPage(next); setNotice(''); }
  function activateSession(next: Session) {
    changeProgress(current => ({ ...current, activeSession: next }));
    setPendingSession(null); setNotice(''); setPage('session');
  }
  function requestSession(mode: SessionMode, lesson?: Lesson) {
    if (!storageReady.current) { setPage('progress'); return; }
    try {
      const questions = mode === 'lesson'
        ? selectQuestions(curriculum.questions, { count: 5, unitId: lesson!.unitId, lessonId: lesson!.id })
        : mode === 'exam'
          ? selectQuestions(curriculum.questions, { count: 40, exam: true })
          : selectQuestions(practiceQuestions, { count: quickCount, ...(quickUnit !== 'all' ? { unitId: quickUnit } : {}), mistakesOnly, progress: progressRef.current });
      if (!questions.length) { setNotice('No hay preguntas para esta selección. Cambia la unidad o desactiva «Solo mis errores».'); return; }
      const next = startSession(mode, questions, lesson?.id);
      if (progressRef.current.activeSession && progressRef.current.activeSession.stage !== 'results') setPendingSession(next);
      else activateSession(next);
    } catch (error) { setNotice(errorText(error)); }
  }
  // The viewer closes first so its dialog never stacks with the «new session» confirmation.
  function startUnit(unit: Unit) {
    setReelUnit(null);
    const lesson = lessonById.get(firstPendingLesson(unit.lessonIds, progressRef.current.completedLessons))!;
    if (progressRef.current.activeSession?.lessonId === lesson.id) navigate('session');
    else requestSession('lesson', lesson);
  }
  function toggleOption(id: string) {
    changeProgress(current => {
      const active = current.activeSession;
      if (!active || active.stage !== 'question') return current;
      const question = questionById.get(active.questionIds[active.index])!;
      const selectedIds = question.kind === 'single' ? [id] : active.selectedIds.includes(id) ? active.selectedIds.filter(selected => selected !== id) : [...active.selectedIds, id];
      return { ...current, activeSession: { ...active, selectedIds } };
    });
  }
  function submitAnswer() {
    changeProgress(current => {
      const active = current.activeSession;
      if (!active || active.stage !== 'question' || !active.selectedIds.length) return current;
      return recordAnswer(current, questionById.get(active.questionIds[active.index])!, active.selectedIds);
    });
  }
  function advanceSession() {
    changeProgress(current => {
      const active = current.activeSession;
      if (!active || active.stage !== 'feedback') return current;
      const finished = active.index === active.questionIds.length - 1;
      const next = { ...current, activeSession: { ...active, stage: finished ? 'results' as const : 'question' as const, index: finished ? active.index : active.index + 1, selectedIds: [] } };
      return finished && active.mode === 'lesson' && active.lessonId ? completeLesson(next, active.lessonId) : next;
    });
  }
  function finishSession() { changeProgress(current => ({ ...current, activeSession: null })); navigate(session?.mode === 'exam' ? 'exam' : session?.mode === 'quick' ? 'quick' : 'learn'); }
  function resetMatching(id = matchId) { setMatchId(id); setMatched([]); setSelectedTerm(null); setWrongDefinition(null); setMatchNotice('Elige un concepto y después su definición.'); setMatchRound(round => round + 1); }
  function chooseDefinition(id: string) {
    if (!selectedTerm || matched.includes(id)) { if (!selectedTerm) setMatchNotice('Primero elige un concepto de la columna izquierda.'); return; }
    if (selectedTerm !== id) { setWrongDefinition(id); setMatchNotice('Todavía no encajan. Conserva el concepto y prueba otra definición.'); return; }
    const next = [...matched, id]; setMatched(next); setSelectedTerm(null); setWrongDefinition(null);
    if (next.length === matchingSet!.pairs.length) {
      setMatchNotice('¡Todas las ideas conectadas! Puedes repetir o probar otro conjunto.');
      changeProgress(current => current.completedMatching.includes(matchId) ? current : ({ ...current, completedMatching: [...current.completedMatching, matchId] }));
    } else setMatchNotice(`¡Encajan! ${next.length} de ${matchingSet!.pairs.length} parejas conectadas.`);
  }
  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; setImportError(''); setNotice('');
    if (!file) return;
    const revision = ++importReadRevision.current;
    if (file.size > 5_000_000) { setImportReading(false); setImportError('Este archivo supera 5 MB. Elige un respaldo JSON exportado desde Pliegue IA. Tu progreso sigue intacto.'); return; }
    setImportReading(true);
    try {
      const imported = parseBackup(await file.text(), curriculum);
      if (revision === importReadRevision.current) setPendingImport({ progress: imported, name: file.name });
    } catch (error) {
      if (revision === importReadRevision.current) setImportError(`${errorText(error)} Elige otro respaldo de Pliegue IA. Tu progreso sigue intacto.`);
    } finally { if (revision === importReadRevision.current) setImportReading(false); }
  }
  async function confirmImport() {
    if (!pendingImport || importBusy) return;
    setImportBusy(true); setImportError('');
    try {
      await restoreProgress(pendingImport.progress, curriculum);
      progressRef.current = pendingImport.progress; storageReady.current = true; setProgress(pendingImport.progress);
      saveRevision.current++; setSaving(false); setSaveFailure(null); setLoadFailure(null); setPendingImport(null);
      resetMatching(); setPage('progress');
      const upcoming = curriculum.lessons.find(lesson => !pendingImport.progress.completedLessons.includes(lesson.id));
      if (upcoming) setWorldId(upcoming.worldId);
      setNotice('Respaldo restaurado. Tu progreso y tu sesión están listos.');
    } catch (error) { setImportError(`${errorText(error)} No se confirmó la restauración. Puedes volver a intentarlo.`); setPendingImport(null); }
    finally { setImportBusy(false); }
  }
  async function downloadBackup() {
    if (exportBusy) return;
    setExportBusy(true); setNotice('');
    try { await exportBackup(progressRef.current); setNotice(isNative ? 'Respaldo preparado en el menú de compartir de Android. Elige dónde guardarlo.' : 'Descarga del respaldo solicitada. Revisa la carpeta de descargas de tu navegador.'); }
    catch (error) { setNotice(`No se pudo exportar: ${errorText(error)}`); }
    finally { setExportBusy(false); }
  }

  function heading(eyebrow: string, title: string, subtitle?: string) {
    return <section className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1 ref={mainHeading} tabIndex={-1}>{title}<span>.</span></h1>{subtitle && <p className="page-description">{subtitle}</p>}</div>{page === 'learn' && <div className="source-tag">GENERATIVE AI LEADER</div>}</section>;
  }
  function renderLearn() {
    const nextDone = progress.completedLessons.length === curriculum.lessons.length;
    return <>{heading('TU RUTA DE APRENDIZAJE', 'Una idea a la vez')}<div className="dashboard-grid"><div>
      <section className="next-lesson paper"><div className="lesson-badge"><span/> {session ? 'TU PLIEGUE EN CURSO' : nextDone ? 'VUELVE A TUS IDEAS' : 'TU PRÓXIMO PLIEGUE'}</div>
        <p className="chapter-label">{session && session.mode !== 'lesson' ? session.mode === 'exam' ? 'DESAFÍO FINAL · 40 PREGUNTAS' : 'REPASO RÁPIDO · CONECTA TUS IDEAS' : <>MUNDO {String(sessionLesson?.worldId ?? nextLesson.worldId).padStart(2, '0')} · {sessionLesson ? curriculum.worlds.find(world => world.id === sessionLesson.worldId)?.shortTitle : nextWorld.shortTitle}</>}</p>
        <h2>{session ? sessionLesson?.title ?? (session.mode === 'exam' ? 'Tu desafío continúa.' : 'Un repaso en marcha.') : nextLesson.id === curriculum.lessons[0].id && !nextDone ? <>Mucho más<br/>que un chatbot.</> : nextLesson.title}</h2>
        <p>{session ? `${session.responses.length} de ${session.questionIds.length} ${plural(session.questionIds.length, 'pregunta respondida', 'preguntas respondidas')}. Tu sesión está guardada.` : nextDone ? 'Completaste la ruta. Repite una lección y afianza lo aprendido.' : 'Descubre lo que la IA generativa puede crear, resolver y transformar.'}</p>
        <button className="button warm" onClick={() => session ? navigate('session') : requestSession('lesson', nextLesson)}><Play size={18} fill="currentColor"/>{session ? session.stage === 'results' ? 'Ver resultados' : 'Continuar sesión' : nextDone ? 'Repasar una lección' : progress.completedLessons.length ? 'Seguir aprendiendo' : 'Empezar a aprender'}</button><span className="card-fold" aria-hidden="true"/>
      </section>
      <section className="world-selector" role="tablist" aria-label="Mundos de aprendizaje">{curriculum.worlds.map((world, index) => { const Icon = worldIcons[index % worldIcons.length]; return <button key={world.id} id={`world-tab-${world.id}`} role="tab" tabIndex={worldId === world.id ? 0 : -1} aria-selected={worldId === world.id} aria-controls="world-panel" title={world.title} className={`world-tab ${worldId === world.id ? 'selected' : ''}`} onClick={() => setWorldId(world.id)} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? curriculum.worlds.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + curriculum.worlds.length) % curriculum.worlds.length; setWorldId(curriculum.worlds[next].id); document.getElementById(`world-tab-${curriculum.worlds[next].id}`)?.focus(); }}><Icon size={22}/><span>{String(world.id).padStart(2, '0')}</span><span className="sr-only">{world.title}</span></button>; })}</section>
      <div id="world-panel" role="tabpanel" tabIndex={0} aria-labelledby={`world-tab-${worldId}`}><div className="world-intro"><h2>{currentWorld.title}</h2><p>{currentWorld.description}</p></div>
      {curriculum.units.filter(unit => unit.worldId === worldId).map((unit, index) => <section className="unit" key={unit.id}><div className="unit-title"><span className="unit-number">{String(index + 1).padStart(2, '0')}</span><div><p className="eyebrow">UNIDAD {unit.id}</p><h3>{unit.title}</h3></div>{reelByUnit.has(unit.id) && <button className="reel-open" onClick={() => setReelUnit(unit)} aria-label={`Ver reel de la unidad ${unit.id}`}><Clapperboard size={17}/>Ver reel</button>}<span className="unit-count" aria-label={`${unit.lessonIds.filter(id => progress.completedLessons.includes(id)).length} de ${unit.lessonIds.length} lecciones completadas`}>{unit.lessonIds.filter(id => progress.completedLessons.includes(id)).length} / {unit.lessonIds.length}</span></div>
        <div className="lesson-path">{unit.lessonIds.map((id, lessonIndex) => { const lesson = lessonById.get(id)!; const done = progress.completedLessons.includes(id); const current = nextLesson.id === id && !done; return <button key={id} className={`lesson-node ${current ? 'current' : ''}`} onClick={() => session?.lessonId === id ? navigate('session') : requestSession('lesson', lesson)}><span className={`node-circle ${done ? 'done' : current ? '' : 'secondary'}`}>{done ? <Check size={24}/> : current ? <Play size={22} fill="currentColor"/> : lessonIndex + 1}</span><span className="node-copy"><small>LECCIÓN {id}</small><strong>{lesson.title}</strong><span>{done ? 'Completada · volver a practicar' : session?.lessonId === id ? 'Sesión en curso' : 'Una idea + una práctica breve'}</span></span>{current && <span className="node-pill">EMPEZAR</span>}<ChevronRight className="node-arrow" size={18}/></button>; })}</div>
      </section>)}</div>
    </div><aside className="right-column"><section className="companion-card paper"><span className="tiny-tape" aria-hidden="true"/><Fox/><p className="eyebrow">UN PASITO CADA DÍA</p><h3>{shownStreak(progress) ? <>Ya llevas {shownStreak(progress)} {shownStreak(progress) === 1 ? 'día' : 'días'}.<br/>Sigue dando forma.</> : <>Tu próxima idea<br/>te está esperando.</>}</h3><p>{shownStreak(progress) ? 'Cada pregunta es una oportunidad para conectar ideas.' : 'Responde una pregunta y empieza tu racha.'}</p><div className="daily-progress"><Flame size={18}/><span>Mejor racha: {progress.streak.best} {progress.streak.best === 1 ? 'día' : 'días'}</span></div></section>
      <section className="quick-card paper"><div className="card-icon"><Shuffle/></div><h3>¿Tienes un ratito?</h3><p>5 o 10 preguntas.<br/>Una chispa para tu memoria.</p><button className="button ink" onClick={() => navigate('quick')}>Repaso rápido</button></section>
      <div className="offline-note">{online ? <Check size={16}/> : <WifiOff size={16}/>}<span>{offlineReady ? online ? 'Listo para estudiar sin conexión' : 'Estás estudiando sin conexión' : import.meta.env.DEV ? 'Vista previa · sin conexión al instalar' : online ? 'Preparando contenido sin conexión…' : 'Sin conexión · instalación pendiente'}</span></div>
      <p className="source-count">{curriculum.lessons.length} lecciones · {practiceQuestions.length} preguntas de práctica · {examQuestions.length} de simulacro</p>
    </aside></div></>;
  }
  function renderQuick() {
    return <>{heading('UN POCO DE PRÁCTICA', 'Activa tu memoria', 'Elige tu repaso. Cada respuesta incluye una explicación para seguir aprendiendo.')}<div className="mode-grid"><section className="panel paper"><div className="card-icon"><Shuffle/></div><h2>Tu repaso, a tu medida</h2><fieldset className="choice-field"><legend>¿Cuántas preguntas?</legend><div className="segmented">{[5, 10].map(count => <button key={count} className={quickCount === count ? 'selected' : ''} aria-pressed={quickCount === count} onClick={() => setQuickCount(count)}>{count} preguntas</button>)}</div></fieldset>
      <label className="field-label" htmlFor="quick-unit">¿Qué quieres practicar?</label><select id="quick-unit" value={quickUnit} onChange={event => setQuickUnit(event.target.value)}><option value="all">Todas las unidades</option>{curriculum.units.map(unit => <option key={unit.id} value={unit.id}>{unit.id} · {unit.title}</option>)}</select>
      <label className="check-setting"><input type="checkbox" checked={mistakesOnly} onChange={event => setMistakesOnly(event.target.checked)}/><span><strong>Solo mis errores</strong><small>Preguntas cuya última respuesta fue incorrecta.</small></span><span className="count-badge">{mistakeCount}</span></label>
      <p className="helper">{eligibleQuick.length ? `${Math.min(quickCount, eligibleQuick.length)} ${plural(Math.min(quickCount, eligibleQuick.length), 'pregunta', 'preguntas')} al azar de ${eligibleQuick.length} ${plural(eligibleQuick.length, 'disponible', 'disponibles')}${eligibleQuick.length < quickCount ? eligibleQuick.length === 1 ? '; incluiremos la única disponible' : '; incluiremos todas las disponibles' : ', sin repeticiones en esta sesión'}.` : mistakesOnly ? 'No hay errores pendientes con este filtro. ¡Buen trabajo! Prueba otra unidad o desactiva este filtro.' : 'No hay preguntas disponibles en esta unidad.'}</p>
      <button className="button blue" onClick={() => requestSession('quick')} disabled={!eligibleQuick.length}><Play size={18} fill="currentColor"/>Empezar repaso</button></section><aside className="mode-aside"><Fox mood="encourage"/><h3>Equivocarte también cuenta.</h3><p>El repaso de errores se actualiza después de cada respuesta. Una pregunta sale de esa lista cuando vuelves a acertarla.</p><p className="small-note">{practiceQuestions.length} preguntas de práctica. El banco de {examQuestions.length} preguntas del desafío se mantiene separado.</p></aside></div></>;
  }
  function renderExam() {
    return <>{heading('PON LAS IDEAS EN PRÁCTICA', 'Tu desafío final', 'Un simulacro para reconocer lo que dominas y lo que conviene repasar.')}<div className="mode-grid"><section className="panel paper exam-card"><span className="eyebrow">UNA VISTA DE TODA LA RUTA</span><h2>40 preguntas.<br/>Muchas conexiones.</h2><p>Practica con las {examQuestions.length} preguntas del banco de simulacro, en orden aleatorio y sin repeticiones.</p><ul className="feature-list"><li><CheckCircle2/>Selección única y selección múltiple</li><li><CheckCircle2/>Explicación y fuente después de responder</li><li><CheckCircle2/>Sin límite de tiempo; puedes pausar y continuar</li></ul><p className="small-note">Es una herramienta de estudio, no un examen oficial ni una predicción de certificación.</p><button className="button blue" onClick={() => requestSession('exam')}><Flag size={18}/>Empezar desafío de 40</button></section><aside className="mode-aside"><Fox/><h3>Una pregunta a la vez.</h3><p>Tu sesión queda guardada en este dispositivo. Puedes explorar la ruta y regresar cuando quieras.</p></aside></div></>;
  }
  function renderMatching() {
    if (!matchingSet) return <>{heading('CONECTA IDEAS', 'Próximamente')}</>;
    const complete = matched.length === matchingSet.pairs.length;
    return <>{heading('EL CONOCIMIENTO ENCAJA', 'Conecta ideas', `${curriculum.matches.length} conjuntos para unir conceptos y definiciones.`)}<div className="matching-tabs" aria-label="Conjuntos de parejas">{curriculum.matches.map((match, index) => <button className={matchId === match.id ? 'selected' : ''} aria-pressed={matchId === match.id} key={match.id} onClick={() => resetMatching(match.id)}>{progress.completedMatching.includes(match.id) ? <Check size={17}/> : <Layers size={17}/>}<span>{index + 1}. {match.title}</span></button>)}</div>
      <section className="panel paper matching-panel"><div className="section-heading"><div><p className="eyebrow">UNIDAD {matchingSet.unitId}</p><h2>{matchingSet.title}</h2></div><span className="count-badge">{matched.length} / {matchingSet.pairs.length}</span></div><p>Elige un concepto y luego la definición que le corresponde. Puedes usar el teclado o tocar las tarjetas.</p><div className="matching-board"><div className="match-column"><h3>Conceptos</h3>{matchingSet.pairs.map(pair => <button key={pair.id} className={`match-card ${matched.includes(pair.id) ? 'matched' : selectedTerm === pair.id ? 'selected' : ''}`} disabled={matched.includes(pair.id)} aria-pressed={selectedTerm === pair.id} onClick={() => { setSelectedTerm(pair.id); setWrongDefinition(null); setMatchNotice(`Concepto elegido: ${pair.term}. Busca su definición.`); }}>{matched.includes(pair.id) && <Check size={18}/>}<span>{pair.term}</span>{matched.includes(pair.id) && <span className="sr-only">Conectado</span>}</button>)}</div><div className="match-column"><h3>Definiciones</h3>{definitions.map(pair => <button key={pair.id} className={`match-card definition ${matched.includes(pair.id) ? 'matched' : wrongDefinition === pair.id ? 'wrong' : ''}`} disabled={matched.includes(pair.id)} onClick={() => chooseDefinition(pair.id)}>{matched.includes(pair.id) && <Check size={18}/>}<span>{pair.definition}</span>{matched.includes(pair.id) && <span className="sr-only">Conectada</span>}</button>)}</div></div><div className={`matching-feedback ${complete ? 'complete' : ''}`} role="status">{complete && <Fox mood="celebrate"/>}<p>{matchNotice}</p></div><button className="button outline" onClick={() => resetMatching()}><RotateCcw size={17}/>Volver a conectar</button></section></>;
  }
  function renderSession() {
    if (!session) return <>{heading('TODO LISTO', 'Elige tu siguiente paso')}<button className="button blue" onClick={() => navigate('learn')}>Volver a la ruta</button></>;
    const correctCount = session.responses.filter(response => response.correct).length;
    const answered = session.responses.length;
    const source = sessionLesson?.sourceUrl;
    return <div className="session-wrap"><div className="session-top"><button className="text-button" onClick={() => navigate(session.mode === 'exam' ? 'exam' : session.mode === 'quick' ? 'quick' : 'learn')}><ArrowLeft size={18}/>Pausar y volver</button><span>{session.mode === 'lesson' ? `LECCIÓN ${session.lessonId}` : session.mode === 'exam' ? 'DESAFÍO FINAL' : 'REPASO RÁPIDO'}</span></div>
      <div className="session-progress"><progress value={answered} max={session.questionIds.length} aria-label="Preguntas respondidas"/><span>{answered} / {session.questionIds.length}</span></div>
      {session.stage === 'intro' && sessionLesson ? <>{heading('PRIMERO, UNA IDEA', sessionLesson.title)}<article className="lesson-content panel paper"><div className="idea-block"><span className="eyebrow">LA IDEA CENTRAL</span><Markdown>{sessionLesson.idea}</Markdown></div>{sessionLesson.keyPoints.length > 0 && <section><h2>Qué conviene recordar</h2><ul className="key-points">{sessionLesson.keyPoints.map((point, index) => <li key={index}><span className="point-number">{index + 1}</span><Markdown>{point}</Markdown></li>)}</ul></section>}{sessionLesson.example && <section className="example-block"><h2>Un ejemplo para verlo</h2><Markdown>{sessionLesson.example}</Markdown></section>}{sessionLesson.distinctions && <section><h2>No confundas estas ideas</h2><Markdown>{sessionLesson.distinctions}</Markdown></section>}<a href={source} target="_blank" rel="noreferrer" className="source-link">Consultar la fuente del curso<ExternalLink size={15}/></a><div className="lesson-start"><p>Ahora, {session.questionIds.length} {plural(session.questionIds.length, 'pregunta', 'preguntas')} para darle forma a lo aprendido.</p><button className="button blue" onClick={() => changeProgress(current => current.activeSession?.stage === 'intro' ? ({ ...current, activeSession: { ...current.activeSession, stage: 'question' } }) : current)}>Vamos a practicar</button></div></article></> : null}
      {(session.stage === 'question' || session.stage === 'feedback') && currentQuestion ? <>{heading(`PREGUNTA ${session.index + 1} DE ${session.questionIds.length}`, currentQuestion.kind === 'multiple' ? 'Conecta todas las respuestas' : 'Elige tu respuesta')}<section className="question-panel panel paper"><div id="question-prompt"><Markdown className="question-prompt">{currentQuestion.prompt}</Markdown></div><p id="selection-help" className="selection-help">{currentQuestion.kind === 'multiple' ? 'Selección múltiple: marca todas las opciones correctas.' : 'Selección única: marca una opción.'}</p><fieldset className="answer-options" aria-labelledby="question-prompt" aria-describedby="selection-help" disabled={session.stage === 'feedback'}><legend className="sr-only">Opciones de respuesta</legend>{currentQuestion.options.map(option => { const selected = session.selectedIds.includes(option.id); const feedback = session.stage === 'feedback'; const correct = currentQuestion.correctIds.includes(option.id); return <label key={option.id} className={`answer-option ${selected ? 'selected' : ''} ${feedback && correct ? 'correct' : ''} ${feedback && selected && !correct ? 'incorrect' : ''}`}><input type={currentQuestion.kind === 'multiple' ? 'checkbox' : 'radio'} name={`answer-${currentQuestion.id}`} checked={selected} onChange={() => toggleOption(option.id)} value={option.id}/><span className="sr-only">Opción {option.id}. </span><span className="option-letter" aria-hidden="true">{feedback && correct ? <Check size={18}/> : feedback && selected ? <X size={18}/> : option.id}</span><Markdown>{option.text}</Markdown>{feedback && (correct || selected) && <span className="answer-state">{correct ? 'Correcta' : 'Tu elección'}</span>}</label>; })}</fieldset>
      {session.stage === 'question' ? <div className="question-actions"><span>{currentQuestion.kind === 'multiple' ? `${session.selectedIds.length} ${plural(session.selectedIds.length, 'opción seleccionada', 'opciones seleccionadas')}` : 'Tómate el tiempo que necesites.'}</span><button className="button blue" disabled={!session.selectedIds.length} onClick={submitAnswer}>Comprobar<Check size={18}/></button></div> : <div className={`answer-feedback ${session.responses[session.index]?.correct ? 'is-correct' : 'is-learning'}`}><div className="feedback-heading"><Fox mood={session.responses[session.index]?.correct ? 'celebrate' : 'encourage'}/><div><p className="eyebrow">{session.responses[session.index]?.correct ? '¡BUEN PLIEGUE!' : 'UNA OPORTUNIDAD PARA APRENDER'}</p><h2 ref={feedbackHeading} tabIndex={-1}>{session.responses[session.index]?.correct ? '¡Así es!' : 'Vamos a darle otra vuelta.'}</h2><p>{session.responses[session.index]?.correct ? 'Has conectado la idea.' : `Respuesta${currentQuestion.correctIds.length > 1 ? 's correctas' : ' correcta'}: ${currentQuestion.correctIds.join(', ')}.`}</p></div></div><Markdown>{currentQuestion.explanation}</Markdown><p className="question-source">{currentQuestion.sourceUrl ? <a href={currentQuestion.sourceUrl} target="_blank" rel="noreferrer">{currentQuestion.sourceLabel}<ExternalLink size={14}/></a> : currentQuestion.sourceLabel}</p><button className="button ink" onClick={advanceSession}>{session.index === session.questionIds.length - 1 ? 'Ver mis resultados' : 'Siguiente pregunta'}</button></div>}
      </section></> : null}
      {session.stage === 'results' ? <>{heading('CADA IDEA SUMA', session.mode === 'lesson' ? 'Un pliegue más' : 'Práctica completada')}<section className="results-panel panel paper"><Fox mood="celebrate"/><div className="result-score"><strong>{correctCount}<span> / {session.questionIds.length}</span></strong><p>{plural(correctCount, 'respuesta correcta', 'respuestas correctas')} · {Math.round(correctCount / session.questionIds.length * 100)}%</p></div><h2>{session.mode === 'lesson' ? 'Lección completada.' : correctCount === session.questionIds.length ? '¡Todas las ideas encajaron!' : 'Ya sabes dónde seguir practicando.'}</h2><p>{session.mode === 'lesson' ? 'Tu avance quedó registrado en la ruta. Sigue con la próxima idea cuando quieras.' : 'Tus respuestas actualizan el progreso y la lista de errores para tu próximo repaso.'}</p><div className="button-row"><button className="button blue" onClick={finishSession}>Volver a {session.mode === 'lesson' ? 'la ruta' : session.mode === 'exam' ? 'desafío' : 'repaso'}</button><button className="button outline" onClick={() => requestSession(session.mode, sessionLesson)}><RotateCcw size={17}/>Practicar de nuevo</button></div></section><section className="result-review"><h2>Tus respuestas, paso a paso</h2>{session.responses.map((response, index) => { const question = questionById.get(response.questionId)!; return <details key={response.questionId} className="review-item"><summary><span className={response.correct ? 'review-correct' : 'review-incorrect'}>{response.correct ? <Check size={18}/> : <RotateCcw size={18}/>}</span><span>Pregunta {index + 1} · {response.correct ? 'Correcta' : 'Para repasar'}</span><ChevronRight size={18}/></summary><div className="review-body"><Markdown>{question.prompt}</Markdown><p><strong>Tu respuesta:</strong> {response.selectedIds.join(', ')} · <strong>Correcta:</strong> {question.correctIds.join(', ')}</p><ul>{question.options.filter(option => question.correctIds.includes(option.id)).map(option => <li key={option.id}><Markdown>{`${option.id}. ${option.text}`}</Markdown></li>)}</ul><Markdown>{question.explanation}</Markdown><p className="question-source">{question.sourceUrl ? <a href={question.sourceUrl} target="_blank" rel="noreferrer">{question.sourceLabel}<ExternalLink size={14}/></a> : question.sourceLabel}</p></div></details>; })}</section></> : null}
    </div>;
  }
  function renderProgress() {
    return <>{heading('LO QUE YA TOMÓ FORMA', loadFailure ? 'Recupera tu progreso' : 'Cada paso cuenta', loadFailure ? 'Tus datos guardados se conservaron. Puedes restaurar un respaldo válido.' : 'Tu avance se guarda en este dispositivo, sin crear una cuenta.')}
      {!loadFailure && <><section className="stat-grid" aria-label="Estadísticas"><div className="stat-tile"><Sparkles/><strong>{progress.xp}</strong><span>XP acumulados</span></div><div className="stat-tile"><BookOpen/><strong>{progress.completedLessons.length}<small> / {curriculum.lessons.length}</small></strong><span>Lecciones completadas</span></div><div className="stat-tile"><Flame/><strong>{shownStreak(progress)}<small> {plural(shownStreak(progress), 'día', 'días')}</small></strong><span>Racha actual · mejor: {progress.streak.best}</span></div><div className="stat-tile"><CheckCircle2/><strong>{answerStats.attempts ? `${Math.round(answerStats.correct / answerStats.attempts * 100)}%` : '—'}</strong><span>{answerStats.attempts} {plural(answerStats.attempts, 'respuesta', 'respuestas')} · {answerStats.correct} {plural(answerStats.correct, 'acierto', 'aciertos')}</span></div></section><section className="panel paper progress-worlds"><h2>Tu ruta, mundo a mundo</h2>{curriculum.worlds.map(world => { const lessons = curriculum.lessons.filter(lesson => lesson.worldId === world.id); const done = lessons.filter(lesson => progress.completedLessons.includes(lesson.id)).length; return <div className="world-progress" key={world.id}><div><strong>{world.id}. {world.title}</strong><span>{done} / {lessons.length}</span></div><progress value={done} max={lessons.length} aria-label={`${world.title}: ${done} de ${lessons.length} lecciones`}/></div>; })}<p className="helper">{progress.completedMatching.length} de {curriculum.matches.length} conjuntos de parejas completados · {mistakeCount} {plural(mistakeCount, 'pregunta de práctica para repasar', 'preguntas de práctica para repasar')}.</p><details className="how-progress"><summary>Cómo funciona tu progreso</summary><p>Tu primer acierto en una pregunta suma 10 XP; los siguientes, 5 XP. Las respuestas incorrectas no restan. La racha aumenta al responder en días consecutivos. Una lección se completa al llegar a sus resultados, y las parejas registran conjuntos completados.</p></details></section></>}
      <div className="settings-grid"><section className="panel paper"><div className="section-heading"><h2>Tu respaldo personal</h2><ShieldCheck size={25}/></div><p>Exporta un archivo JSON para conservar tu avance o llevarlo a otro dispositivo.</p><p className="helper">{isNative ? 'Android: «Guardar o compartir» abre el menú del sistema para elegir una app o ubicación.' : 'Navegador: «Descargar respaldo» guarda un archivo en tus descargas.'}</p><div className="button-row"><button className="button ink" disabled={!!loadFailure || exportBusy} onClick={downloadBackup}><Download size={18}/>{exportBusy ? 'Preparando…' : isNative ? 'Guardar o compartir' : 'Descargar respaldo'}</button><button className="button outline" disabled={importReading || importBusy} onClick={() => { setImportError(''); fileInput.current?.click(); }}><Upload size={18}/>{importReading ? 'Leyendo archivo…' : 'Importar JSON'}</button></div><input ref={fileInput} type="file" accept={isNative ? '*/*' : '.json,application/json'} className="sr-only" tabIndex={-1} aria-label="Seleccionar respaldo de Pliegue IA" onChange={readImport}/><p className="small-note">{isNative && 'Elige tu archivo de respaldo JSON en el selector de Android. '}Importar reemplaza el progreso de este dispositivo. Primero validaremos el archivo y te pediremos confirmar.</p>{importError && <p className="inline-error" role="alert">{importError}</p>}</section><section className="panel paper"><h2>A tu ritmo</h2><label className="check-setting"><input type="checkbox" checked={progress.settings.reducedMotion} disabled={!!loadFailure} onChange={event => changeProgress(current => ({ ...current, settings: { ...current.settings, reducedMotion: event.target.checked } }))}/><span><strong>Reducir movimiento</strong><small>Desactiva rebotes y movimientos del personaje.</small></span></label><p className="helper">También respetamos la preferencia de movimiento reducido de tu dispositivo.</p><p className="small-note">{loading ? 'Abriendo progreso…' : loadFailure ? 'Progreso pendiente de recuperación.' : saving ? 'Guardando cambios…' : saveFailure ? 'Hay cambios pendientes de guardar.' : 'Progreso guardado en este dispositivo.'}</p>{!isNative && <><a className="button outline" href={`${import.meta.env.BASE_URL}downloads/pliegue-ia.apk`} download><Download size={18}/>Descargar APK para Android</a><p className="small-note">Android 7.0 o posterior. Instala el APK para estudiar desde la app.</p></>}</section></div>
      <section className="content-footnote"><h2>Una ruta basada en tus materiales</h2><p>{curriculum.worlds.length} mundos · {curriculum.units.length} unidades · {curriculum.lessons.length} lecciones · {practiceQuestions.length} preguntas de práctica · {examQuestions.length} de simulacro.</p><p>Contenido: {curriculum.sourceDate}. Cada lección y pregunta conserva su referencia. Los enlaces a las fuentes requieren conexión; la práctica usa contenido incluido en la app.</p></section></>;
  }

  return <div className="app-shell" data-reduced-motion={progress.settings.reducedMotion}><a className="skip-link" href="#main-content">Saltar al contenido</a><aside className="sidebar"><button className="brand" onClick={() => navigate('learn')} aria-label="Pliegue IA, ir a aprender"><img src={asset('favicon.svg')} alt=""/><span>pliegue<span className="brand-ia">ia</span></span></button><div className="brand-caption">IDEAS QUE TOMAN FORMA</div><nav aria-label="Principal">{navigation.map(({ page: item, label, short, Icon }) => <button key={item} className={`nav-item ${activePage === item ? 'active' : ''}`} aria-current={activePage === item ? 'page' : undefined} aria-label={short === label ? label : `${short}: ${label}`} title={label} onClick={() => navigate(loadFailure ? 'progress' : item)} disabled={loading}><Icon/><span className="nav-label">{label}</span><span className="nav-short" aria-hidden="true">{short}</span></button>)}</nav><div className="sidebar-bottom"><span className="course-label">TU RUTA</span><strong>Generative AI Leader</strong><p>{curriculum.lessons.length} pequeñas lecciones.<br/>Un mundo de posibilidades.</p><div className="sidebar-progress"><progress max={curriculum.lessons.length} value={progress.completedLessons.length} aria-label="Lecciones completadas"/><span>{progress.completedLessons.length} de {curriculum.lessons.length} completadas</span></div></div></aside><main className="main" id="main-content" tabIndex={-1}><header className="topbar"><span>APRENDE A TU RITMO</span><div className="stats"><span title="Racha de estudio"><Flame size={19}/>{shownStreak(progress)} {shownStreak(progress) === 1 ? 'día' : 'días'}</span><span title="Experiencia acumulada"><Sparkles size={19}/>{progress.xp} XP</span></div></header>
    {loading ? <section className="loading-panel" role="status"><LoaderCircle className="spinning"/><p>Preparando tus ideas…</p></section> : <>
    {loadFailure && <div className="status-banner error" role="alert"><ShieldCheck size={21}/><div><strong>No pudimos abrir el progreso guardado.</strong><p>{loadFailure}</p></div></div>}
    {saveFailure && <div className="status-banner error" role="alert"><div><strong>No se pudo guardar el último cambio.</strong><p>{saveFailure} Mantén la app abierta y reintenta, o exporta un respaldo desde Mi progreso.</p></div><button className="button outline" onClick={() => persist(progressRef.current)}>Reintentar guardado</button></div>}
    {notice && <div className="status-banner" role="status"><p>{notice}</p><button className="icon-button" onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={19}/></button></div>}
    {session && page !== 'session' && page !== 'learn' && !loadFailure && <div className="resume-banner"><span><strong>{session.stage === 'results' ? 'Resultados listos' : 'Tienes una sesión guardada'}</strong><small>{session.responses.length} de {session.questionIds.length} {plural(session.questionIds.length, 'pregunta respondida', 'preguntas respondidas')}</small></span><button className="text-button" onClick={() => navigate('session')}>{session.stage === 'results' ? 'Ver resultados' : 'Continuar'}</button></div>}
    {loadFailure ? renderProgress() : page === 'learn' ? renderLearn() : page === 'quick' ? renderQuick() : page === 'exam' ? renderExam() : page === 'matching' ? renderMatching() : page === 'session' ? renderSession() : renderProgress()}
    </>}
  </main>
  {reelUnit && <ReelViewer key={reelUnit.id} reel={reelByUnit.get(reelUnit.id)!} reduced={progress.settings.reducedMotion} onClose={() => setReelUnit(null)} onStartUnit={() => startUnit(reelUnit)}/>}
  {pendingSession && <Confirmation title="¿Empezar una nueva sesión?" confirm="Empezar nueva" onConfirm={() => activateSession(pendingSession)} onCancel={() => setPendingSession(null)}><p>Tienes una sesión en curso con {session?.responses.length} de {session?.questionIds.length} {plural(session?.questionIds.length ?? 0, 'pregunta respondida', 'preguntas respondidas')}. Empezar otra reemplazará esa sesión.</p><p>Tus respuestas registradas, XP y lecciones completadas se conservan.</p><button className="text-button" onClick={() => { setPendingSession(null); navigate('session'); }}>Continuar mi sesión actual</button></Confirmation>}
  {pendingImport && <Confirmation title="¿Restaurar este respaldo?" confirm="Reemplazar mi progreso" onConfirm={() => void confirmImport()} onCancel={() => setPendingImport(null)} busy={importBusy}><p className="backup-filename">{pendingImport.name}</p><p>Archivo validado: <strong>{pendingImport.progress.completedLessons.length} {plural(pendingImport.progress.completedLessons.length, 'lección', 'lecciones')}</strong>, <strong>{pendingImport.progress.xp} XP</strong> y {pendingImport.progress.activeSession ? 'una sesión guardada' : 'ninguna sesión pendiente'}.</p><p>Esto reemplazará el progreso actual de este dispositivo. Puedes cancelar y exportar primero una copia de tu avance actual.</p></Confirmation>}
  </div>;
}
