import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowLeft, BookOpen, Bot, Brain, Briefcase, Check, CheckCircle2, ChevronRight, Clapperboard, Download, ExternalLink, Flag, Flame, Layers, LoaderCircle, MessageCircle, Play, RotateCcw, Settings, ShieldCheck, Shuffle, Sparkles, Upload, WifiOff, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import rawCurriculum from './data/curriculum.json';
import rawGlossary from './data/glossary.json';
import rawReels from './data/reels.json';
import type { Curriculum, Lesson, Progress, Session, SessionMode, Unit } from './types';
import type { GlossaryCard } from './lib/cards';
import { COPY } from './lib/copy';
import { completeLesson, newProgress, parseBackup, recordAnswer, selectQuestions, startSession, touchStreak } from './lib/engine';
import { defaultPrefs, loadPrefs, savePrefs, soundLevel, withSoundLevel } from './lib/prefs';
import type { Prefs } from './lib/prefs';
import { firstPendingLesson } from './lib/reels';
import type { ReelSet } from './lib/reels';
import type { SoundLevel } from './lib/sound';
import { eligibleYesNo } from './lib/yesno';
import { Flashcards } from './modes/Flashcards';
import { FocusHome } from './modes/FocusHome';
import { LessonIntro, stepCount } from './modes/LessonIntro';
import { Matching, restartMatching } from './modes/Matching';
import { YesNo } from './modes/YesNo';
import { exportBackup, loadProgress, restoreProgress, saveProgress } from './lib/storage';
import { ReelViewer } from './reels/ReelViewer';
import { installTapSound, play, setSoundLevel, unlockAudio } from './sound/web';
import { Markdown } from './ui/Markdown';
import { PacePanel } from './ui/PacePanel';
import { TopbarControls } from './ui/TopbarControls';
import { WelcomeCard } from './ui/WelcomeCard';
import { registerStudyTools } from './webmcp';

const curriculum = rawCurriculum as Curriculum;
const reelByUnit = new Map((rawReels as ReelSet).reels.map(reel => [reel.unitId, reel]));
const questionById = new Map(curriculum.questions.map(question => [question.id, question]));
const lessonById = new Map(curriculum.lessons.map(lesson => [lesson.id, lesson]));
const practiceQuestions = curriculum.questions.filter(question => !question.exam);
const examQuestions = curriculum.questions.filter(question => question.exam);
const yesNoQuestions = eligibleYesNo(curriculum.questions);
const deck = rawGlossary.cards as GlossaryCard[];
const worldIcons = [Briefcase, Brain, Layers, MessageCircle, Bot];
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;
type Page = 'learn' | 'quick' | 'matching' | 'exam' | 'progress' | 'session';
type QuickMode = 'questions' | 'yesno' | 'cards';
const quickModes: { mode: QuickMode; label: string; title: string }[] = [
  { mode: 'questions', label: 'Preguntas', title: '' }, { mode: 'yesno', label: '¿Sí o no?', title: '¿Sí o no?' }, { mode: 'cards', label: 'Tarjetas', title: 'Tarjetas de memoria' },
];
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
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const prefsRef = useRef(prefs);
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
  const [quickMode, setQuickMode] = useState<QuickMode>('questions');
  const [roundActive, setRoundActive] = useState(false);
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
  const mainHeading = useRef<HTMLHeadingElement>(null);
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const session = progress.activeSession;
  const sessionLesson = session?.lessonId ? lessonById.get(session.lessonId) : undefined;
  const currentQuestion = session ? questionById.get(session.questionIds[session.index]) : undefined;
  const nextLesson = curriculum.lessons.find(lesson => !progress.completedLessons.includes(lesson.id)) ?? curriculum.lessons[0];
  const currentWorld = curriculum.worlds.find(world => world.id === worldId)!;
  const nextWorld = curriculum.worlds.find(world => world.id === nextLesson.worldId)!;
  const mistakeCount = practiceQuestions.filter(question => progress.answers[question.id]?.lastCorrect === false).length;
  const eligibleQuick = practiceQuestions.filter(question => (quickUnit === 'all' || question.unitId === quickUnit) && (!mistakesOnly || progress.answers[question.id]?.lastCorrect === false));
  const answerStats = Object.values(progress.answers).reduce((total, answer) => ({ attempts: total.attempts + answer.attempts, correct: total.correct + answer.correct }), { attempts: 0, correct: 0 });
  const activePage = page === 'session' ? session?.mode === 'exam' ? 'exam' : session?.mode === 'quick' ? 'quick' : 'learn' : page;
  const isNative = Capacitor.isNativePlatform();
  // Focus mode: plain wording, nothing moving, and a session takes the whole screen.
  const focus = prefs.focus;
  const t = COPY[focus ? 'plain' : 'warm'];
  const calm = progress.settings.reducedMotion || focus;
  const inRound = page === 'quick' && roundActive;
  const immersive = focus && (inRound || (page === 'session' && !!session));
  const doneLessons = progress.completedLessons.length;

  useEffect(() => {
    let active = true;
    const prefsLoaded = loadPrefs().then(saved => { if (active) { prefsRef.current = saved; setPrefs(saved); setSoundLevel(soundLevel(saved)); } });
    loadProgress(curriculum).then(saved => {
      if (!active) return;
      progressRef.current = saved; storageReady.current = true; setProgress(saved);
      const upcoming = curriculum.lessons.find(lesson => !saved.completedLessons.includes(lesson.id));
      if (upcoming) setWorldId(upcoming.worldId);
    }).catch(error => { if (active) { setLoadFailure(errorText(error)); setPage('progress'); } }).finally(() => prefsLoaded.then(() => { if (active) setLoading(false); }));
    const updateOnline = () => setOnline(navigator.onLine);
    const updateOfflineReady = () => setOfflineReady(document.documentElement.dataset.offlineReady === 'true');
    updateOfflineReady();
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);
    window.addEventListener('pliegue-offline-ready', updateOfflineReady);
    return () => { active = false; window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); window.removeEventListener('pliegue-offline-ready', updateOfflineReady); };
  }, []);
  useEffect(() => registerStudyTools(() => storageReady.current ? progressRef.current : null, () => { setPage('quick'); setQuickMode('questions'); setNotice(''); }), []);
  useEffect(() => installTapSound(), []);
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
  // Preferences live outside Progress, so they work even while saved progress is unreadable.
  function changePrefs(update: (current: Prefs) => Prefs) {
    const next = update(prefsRef.current);
    prefsRef.current = next; setPrefs(next); setSoundLevel(soundLevel(next)); void savePrefs(next);
  }
  function chooseSound(level: SoundLevel) { changePrefs(current => withSoundLevel(current, level)); play('correct'); }
  function chooseFocus(value: boolean) { changePrefs(current => ({ ...current, focus: value })); }
  // Rounds of cards and of yes or no keep no answers; they only count as a day of study.
  function countStudyDay() { changeProgress(current => touchStreak(current)); }
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
  // Sounds are played here, in the handlers, never in effects: a reloaded session must stay silent.
  function submitAnswer() {
    const answered = progressRef.current.activeSession?.responses.length ?? 0;
    changeProgress(current => {
      const active = current.activeSession;
      if (!active || active.stage !== 'question' || !active.selectedIds.length) return current;
      return recordAnswer(current, questionById.get(active.questionIds[active.index])!, active.selectedIds);
    });
    const responses = progressRef.current.activeSession?.responses ?? [];
    if (responses.length > answered) play(responses[responses.length - 1].correct ? 'correct' : 'incorrect');
  }
  function advanceSession() {
    const before = progressRef.current.activeSession?.stage;
    changeProgress(current => {
      const active = current.activeSession;
      if (!active || active.stage !== 'feedback') return current;
      const finished = active.index === active.questionIds.length - 1;
      const next = { ...current, activeSession: { ...active, stage: finished ? 'results' as const : 'question' as const, index: finished ? active.index : active.index + 1, selectedIds: [] } };
      return finished && active.mode === 'lesson' && active.lessonId ? completeLesson(next, active.lessonId) : next;
    });
    if (before === 'feedback' && progressRef.current.activeSession?.stage === 'results') play('complete');
  }
  function finishSession() { changeProgress(current => ({ ...current, activeSession: null })); navigate(session?.mode === 'exam' ? 'exam' : session?.mode === 'quick' ? 'quick' : 'learn'); }
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
      restartMatching(); setPage('progress');
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
    return <section className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1 ref={mainHeading} tabIndex={-1}>{title}{!title.endsWith('?') && <span>.</span>}</h1>{subtitle && <p className="page-description">{subtitle}</p>}</div>{page === 'learn' && <div className="source-tag">GENERATIVE AI LEADER</div>}</section>;
  }
  function renderRoute() {
    return <>
      <section className="world-selector" role="tablist" aria-label="Mundos de aprendizaje">{curriculum.worlds.map((world, index) => { const Icon = worldIcons[index % worldIcons.length]; return <button key={world.id} id={`world-tab-${world.id}`} role="tab" tabIndex={worldId === world.id ? 0 : -1} aria-selected={worldId === world.id} aria-controls="world-panel" title={world.title} className={`world-tab ${worldId === world.id ? 'selected' : ''}`} onClick={() => setWorldId(world.id)} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? curriculum.worlds.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + curriculum.worlds.length) % curriculum.worlds.length; setWorldId(curriculum.worlds[next].id); document.getElementById(`world-tab-${curriculum.worlds[next].id}`)?.focus(); }}><Icon size={22}/><span>{String(world.id).padStart(2, '0')}</span><span className="sr-only">{world.title}</span></button>; })}</section>
      <div id="world-panel" role="tabpanel" tabIndex={0} aria-labelledby={`world-tab-${worldId}`}><div className="world-intro"><h2>{currentWorld.title}</h2><p>{currentWorld.description}</p></div>
      {curriculum.units.filter(unit => unit.worldId === worldId).map((unit, index) => <section className="unit" key={unit.id}><div className="unit-title"><span className="unit-number">{String(index + 1).padStart(2, '0')}</span><div><p className="eyebrow">{focus ? 'Unidad' : 'UNIDAD'} {unit.id}</p><h3>{unit.title}</h3></div>{reelByUnit.has(unit.id) && <button className="reel-open" onClick={() => { if (!prefs.muted) unlockAudio(); setReelUnit(unit); }} aria-label={`Ver reel de la unidad ${unit.id}`}><Clapperboard size={17}/>Ver reel</button>}<span className="unit-count" aria-label={`${unit.lessonIds.filter(id => progress.completedLessons.includes(id)).length} de ${unit.lessonIds.length} lecciones completadas`}>{unit.lessonIds.filter(id => progress.completedLessons.includes(id)).length} / {unit.lessonIds.length}</span></div>
        <div className="lesson-path">{unit.lessonIds.map((id, lessonIndex) => { const lesson = lessonById.get(id)!; const done = progress.completedLessons.includes(id); const current = nextLesson.id === id && !done; return <button key={id} className={`lesson-node ${current ? 'current' : ''}`} onClick={() => session?.lessonId === id ? navigate('session') : requestSession('lesson', lesson)}><span className={`node-circle ${done ? 'done' : current ? '' : 'secondary'}`}>{done ? <Check size={24}/> : current ? <Play size={22} fill="currentColor"/> : lessonIndex + 1}</span><span className="node-copy"><small>{focus ? 'Lección' : 'LECCIÓN'} {id}</small><strong>{lesson.title}</strong><span>{done ? 'Completada · volver a practicar' : session?.lessonId === id ? 'Sesión en curso' : 'Una idea + una práctica breve'}</span></span>{current && <span className="node-pill">EMPEZAR</span>}<ChevronRight className="node-arrow" size={18}/></button>; })}</div>
      </section>)}</div>
    </>;
  }
  function renderLearn() {
    const nextDone = doneLessons === curriculum.lessons.length;
    const welcome = !prefs.welcomed && <WelcomeCard level={soundLevel(prefs)} focus={focus} onSound={chooseSound} onFocus={chooseFocus} onDone={() => changePrefs(current => ({ ...current, welcomed: true }))}/>;
    if (focus) return <FocusHome header={<>{heading(t.learnEyebrow, t.learnTitle)}{welcome}</>} lesson={nextLesson} world={nextWorld} steps={stepCount(nextLesson)} questions={Math.min(5, practiceQuestions.filter(question => question.unitId === nextLesson.unitId).length)} done={doneLessons} total={curriculum.lessons.length} session={session} sessionLesson={sessionLesson} onStart={() => requestSession('lesson', nextLesson)} onResume={() => navigate('session')}>{renderRoute()}</FocusHome>;
    return <>{heading(t.learnEyebrow, t.learnTitle)}{welcome}<div className="dashboard-grid"><div>
      <section className="next-lesson paper"><div className="lesson-badge"><span/> {session ? 'TU PLIEGUE EN CURSO' : nextDone ? 'VUELVE A TUS IDEAS' : 'TU PRÓXIMO PLIEGUE'}</div>
        <p className="chapter-label">{session && session.mode !== 'lesson' ? session.mode === 'exam' ? 'DESAFÍO FINAL · 40 PREGUNTAS' : 'REPASO RÁPIDO · CONECTA TUS IDEAS' : <>MUNDO {String(sessionLesson?.worldId ?? nextLesson.worldId).padStart(2, '0')} · {sessionLesson ? curriculum.worlds.find(world => world.id === sessionLesson.worldId)?.shortTitle : nextWorld.shortTitle}</>}</p>
        <h2>{session ? sessionLesson?.title ?? (session.mode === 'exam' ? 'Tu desafío continúa.' : 'Un repaso en marcha.') : nextLesson.id === curriculum.lessons[0].id && !nextDone ? <>Mucho más<br/>que un chatbot.</> : nextLesson.title}</h2>
        <p>{session ? `${session.responses.length} de ${session.questionIds.length} ${plural(session.questionIds.length, 'pregunta respondida', 'preguntas respondidas')}. Tu sesión está guardada.` : nextDone ? 'Completaste la ruta. Repite una lección y afianza lo aprendido.' : 'Descubre lo que la IA generativa puede crear, resolver y transformar.'}</p>
        <button className="button warm" onClick={() => session ? navigate('session') : requestSession('lesson', nextLesson)}><Play size={18} fill="currentColor"/>{session ? session.stage === 'results' ? 'Ver resultados' : 'Continuar sesión' : nextDone ? 'Repasar una lección' : progress.completedLessons.length ? 'Seguir aprendiendo' : 'Empezar a aprender'}</button><span className="card-fold" aria-hidden="true"/>
      </section>
      {renderRoute()}
    </div><aside className="right-column"><section className="companion-card paper"><span className="tiny-tape" aria-hidden="true"/><Fox/><p className="eyebrow">UN PASITO CADA DÍA</p><h3>{shownStreak(progress) ? <>Ya llevas {shownStreak(progress)} {shownStreak(progress) === 1 ? 'día' : 'días'}.<br/>Sigue dando forma.</> : <>Tu próxima idea<br/>te está esperando.</>}</h3><p>{shownStreak(progress) ? 'Cada pregunta es una oportunidad para conectar ideas.' : 'Responde una pregunta y empieza tu racha.'}</p><div className="daily-progress"><Flame size={18}/><span>Mejor racha: {progress.streak.best} {progress.streak.best === 1 ? 'día' : 'días'}</span></div></section>
      <section className="quick-card paper"><div className="card-icon"><Shuffle/></div><h3>¿Tienes un ratito?</h3><p>5 o 10 preguntas.<br/>Una chispa para tu memoria.</p><button className="button ink" onClick={() => navigate('quick')}>Repaso rápido</button></section>
      <div className="offline-note">{online ? <Check size={16}/> : <WifiOff size={16}/>}<span>{offlineReady ? online ? 'Listo para estudiar sin conexión' : 'Estás estudiando sin conexión' : import.meta.env.DEV ? 'Vista previa · sin conexión al instalar' : online ? 'Preparando contenido sin conexión…' : 'Sin conexión · instalación pendiente'}</span></div>
      <p className="source-count">{curriculum.lessons.length} lecciones · {practiceQuestions.length} preguntas de práctica · {examQuestions.length} de simulacro</p>
    </aside></div></>;
  }
  function renderQuick() {
    const current = quickModes.find(item => item.mode === quickMode)!;
    return <>{inRound ? heading('', current.title) : heading(t.quickEyebrow, t.quickTitle, t.quickSubtitle)}
      {!inRound && <div className="segmented mode-switch" role="group" aria-label="Forma de repasar">{quickModes.map(item => <button key={item.mode} className={quickMode === item.mode ? 'selected' : ''} aria-pressed={quickMode === item.mode} onClick={() => setQuickMode(item.mode)}>{item.label}</button>)}</div>}
      {quickMode === 'yesno' ? <YesNo questions={yesNoQuestions} size={focus ? 5 : 10} onStudy={countStudyDay} onRound={setRoundActive}/>
        : quickMode === 'cards' ? <Flashcards deck={deck} focus={focus} onStudy={countStudyDay} onRound={setRoundActive}/>
        : <div className="mode-grid"><section className="panel paper"><div className="card-icon"><Shuffle/></div><h2>{t.quickPanel}</h2><fieldset className="choice-field"><legend>¿Cuántas preguntas?</legend><div className="segmented">{[3, 5, 10].map(count => <button key={count} className={quickCount === count ? 'selected' : ''} aria-pressed={quickCount === count} onClick={() => setQuickCount(count)}>{count} preguntas</button>)}</div></fieldset>
      <label className="field-label" htmlFor="quick-unit">¿Qué quieres practicar?</label><select id="quick-unit" value={quickUnit} onChange={event => setQuickUnit(event.target.value)}><option value="all">Todas las unidades</option>{curriculum.units.map(unit => <option key={unit.id} value={unit.id}>{unit.id} · {unit.title}</option>)}</select>
      <label className="check-setting"><input type="checkbox" checked={mistakesOnly} onChange={event => setMistakesOnly(event.target.checked)}/><span><strong>Solo mis errores</strong><small>Preguntas cuya última respuesta fue incorrecta.</small></span><span className="count-badge">{mistakeCount}</span></label>
      <p className="helper">{eligibleQuick.length ? `${Math.min(quickCount, eligibleQuick.length)} ${plural(Math.min(quickCount, eligibleQuick.length), 'pregunta', 'preguntas')} al azar de ${eligibleQuick.length} ${plural(eligibleQuick.length, 'disponible', 'disponibles')}${eligibleQuick.length < quickCount ? eligibleQuick.length === 1 ? '; incluiremos la única disponible' : '; incluiremos todas las disponibles' : ', sin repeticiones en esta sesión'}.` : mistakesOnly ? t.quickNoMistakes : 'No hay preguntas disponibles en esta unidad.'}</p>
      <button className="button blue" onClick={() => requestSession('quick')} disabled={!eligibleQuick.length}><Play size={18} fill="currentColor"/>{t.quickStart}</button></section><aside className="mode-aside"><Fox mood="encourage"/><h3>Equivocarte también cuenta.</h3><p>El repaso de errores se actualiza después de cada respuesta. Una pregunta sale de esa lista cuando vuelves a acertarla.</p><p className="small-note">{practiceQuestions.length} preguntas de práctica. El banco de {examQuestions.length} preguntas del desafío se mantiene separado.</p></aside></div>}</>;
  }
  function renderExam() {
    return <>{heading(t.examEyebrow, t.examTitle, t.examSubtitle)}<div className="mode-grid"><section className="panel paper exam-card"><span className="eyebrow">{t.examCardEyebrow}</span><h2 className="multiline">{t.examCardTitle}</h2><p>Practica con las {examQuestions.length} preguntas del banco de simulacro, en orden aleatorio y sin repeticiones.</p><ul className="feature-list">{t.examFeatures.map(feature => <li key={feature}><CheckCircle2/>{feature}</li>)}</ul><p className="small-note">{t.examNote}</p><button className="button blue" onClick={() => requestSession('exam')}><Flag size={18}/>{t.examStart}</button></section><aside className="mode-aside"><Fox/><h3>Una pregunta a la vez.</h3><p>Tu sesión queda guardada en este dispositivo. Puedes explorar la ruta y regresar cuando quieras.</p></aside></div></>;
  }
  function renderMatching() {
    return <Matching sets={curriculum.matches} completed={progress.completedMatching} focus={focus} t={t} header={heading(t.matchingEyebrow, 'Conecta ideas', t.matchingSubtitle(curriculum.matches.length))} fox={<Fox mood="celebrate"/>}
      onComplete={id => changeProgress(current => current.completedMatching.includes(id) ? current : ({ ...current, completedMatching: [...current.completedMatching, id] }))}/>;
  }
  function renderSession() {
    if (!session) return <>{heading('TODO LISTO', 'Elige tu siguiente paso')}<button className="button blue" onClick={() => navigate('learn')}>Volver a la ruta</button></>;
    const correctCount = session.responses.filter(response => response.correct).length;
    const answered = session.responses.length;
    const total = session.questionIds.length;
    const feedback = session.stage === 'feedback';
    const right = !!session.responses[session.index]?.correct;
    return <div className="session-wrap"><div className="session-top"><button className="text-button" onClick={() => navigate(session.mode === 'exam' ? 'exam' : session.mode === 'quick' ? 'quick' : 'learn')}><ArrowLeft size={18}/>{t.exitSession}</button><span>{t.sessionLabel(session.mode, session.lessonId)}</span></div>
      {!(focus && session.stage === 'intro') && <div className="session-progress"><progress value={answered} max={total} aria-label="Preguntas respondidas"/><span>{answered} / {total}</span></div>}
      {session.stage === 'intro' && sessionLesson ? <LessonIntro key={session.id} lesson={sessionLesson} sessionId={session.id} questions={total} stepped={focus} header={heading(t.lessonEyebrow, sessionLesson.title)} t={t} onStart={() => changeProgress(current => current.activeSession?.stage === 'intro' ? ({ ...current, activeSession: { ...current.activeSession, stage: 'question' } }) : current)}/> : null}
      {(session.stage === 'question' || session.stage === 'feedback') && currentQuestion ? <>{heading(t.questionEyebrow(session.index + 1, total), t.questionTitle(session.index + 1, total, currentQuestion.kind === 'multiple'))}<section className="question-panel panel paper"><div id="question-prompt"><Markdown className="question-prompt">{currentQuestion.prompt}</Markdown></div><p id="selection-help" className="selection-help">{t.selectionHelp(currentQuestion.kind === 'multiple')}</p><fieldset className="answer-options" aria-labelledby="question-prompt" aria-describedby="selection-help" disabled={feedback}><legend className="sr-only">Opciones de respuesta</legend>{(() => { const item = (option: typeof currentQuestion.options[number]) => { const selected = session.selectedIds.includes(option.id); const correct = currentQuestion.correctIds.includes(option.id); return <label key={option.id} className={`answer-option ${selected ? 'selected' : ''} ${feedback && correct ? 'correct' : ''} ${feedback && selected && !correct ? 'incorrect' : ''}`}><input type={currentQuestion.kind === 'multiple' ? 'checkbox' : 'radio'} name={`answer-${currentQuestion.id}`} checked={selected} onChange={() => toggleOption(option.id)} value={option.id}/><span className="sr-only">Opción {option.id}. </span><span className="option-letter" aria-hidden="true">{feedback && correct ? <Check size={18}/> : feedback && selected ? <X size={18}/> : option.id}</span><Markdown>{option.text}</Markdown>{feedback && (correct || selected) && <span className="answer-state">{correct ? 'Correcta' : t.chosenLabel}</span>}</label>; };
        // After checking, focus mode keeps the chosen and the correct option in view and folds the rest.
        const key = (option: typeof currentQuestion.options[number]) => currentQuestion.correctIds.includes(option.id) || session.selectedIds.includes(option.id);
        const rest = focus && feedback ? currentQuestion.options.filter(option => !key(option)) : [];
        return <>{currentQuestion.options.filter(option => !rest.includes(option)).map(item)}{rest.length > 0 && <details className="other-options"><summary>Ver las otras opciones ({rest.length})</summary>{rest.map(item)}</details>}</>; })()}</fieldset>
      {session.stage === 'question' ? <div className="question-actions"><span>{currentQuestion.kind === 'multiple' ? `${session.selectedIds.length} ${plural(session.selectedIds.length, 'opción seleccionada', 'opciones seleccionadas')}` : t.takeYourTime}</span><button className="button blue" disabled={!session.selectedIds.length} onClick={submitAnswer}>Comprobar<Check size={18}/></button></div> : <div className={`answer-feedback ${right ? 'is-correct' : 'is-learning'}`}><div className="feedback-heading"><Fox mood={right ? 'celebrate' : 'encourage'}/><div><p className="eyebrow">{t.feedbackEyebrow(right)}</p><h2 ref={feedbackHeading} tabIndex={-1}>{t.feedbackTitle(right)}</h2>{t.feedbackDetail(right, currentQuestion.correctIds) && <p>{t.feedbackDetail(right, currentQuestion.correctIds)}</p>}</div></div>{t.why && <p className="why-label">{t.why}</p>}<Markdown>{currentQuestion.explanation}</Markdown>{(!focus || currentQuestion.sourceUrl) && <p className="question-source">{currentQuestion.sourceUrl ? <a href={currentQuestion.sourceUrl} target="_blank" rel="noreferrer">{focus ? t.lessonSource : currentQuestion.sourceLabel}<ExternalLink size={14}/></a> : currentQuestion.sourceLabel}</p>}<button className="button ink" onClick={advanceSession}>{t.nextQuestion(session.index === total - 1)}</button></div>}
      </section></> : null}
      {session.stage === 'results' ? <>{heading(t.resultsEyebrow, t.resultsTitle(session.mode))}<section className="results-panel panel paper"><Fox mood="celebrate"/><div className="result-score"><strong>{correctCount}<span> / {session.questionIds.length}</span></strong><p>{plural(correctCount, 'respuesta correcta', 'respuestas correctas')} · {Math.round(correctCount / session.questionIds.length * 100)}%</p></div><h2>{t.resultsSummary(session.mode, correctCount, total)}</h2><p>{t.resultsNote(session.mode, doneLessons, curriculum.lessons.length)}</p>{focus ? <div className="button-row">{session.mode === 'lesson' && doneLessons < curriculum.lessons.length && <button className="button blue" onClick={() => requestSession('lesson', nextLesson)}>Siguiente lección</button>}{session.mode === 'quick' && <button className="button blue" onClick={() => requestSession('quick')}>Otro repaso</button>}<button className={`button ${session.mode === 'exam' || (session.mode === 'lesson' && doneLessons === curriculum.lessons.length) ? 'blue' : 'outline'}`} onClick={finishSession}>Terminar por ahora</button>{session.mode === 'exam' && <button className="button outline" onClick={() => requestSession('exam')}>Repetir el desafío</button>}</div> : <div className="button-row"><button className="button blue" onClick={finishSession}>Volver a {session.mode === 'lesson' ? 'la ruta' : session.mode === 'exam' ? 'desafío' : 'repaso'}</button><button className="button outline" onClick={() => requestSession(session.mode, sessionLesson)}><RotateCcw size={17}/>Practicar de nuevo</button></div>}</section><section className="result-review"><h2>{t.reviewTitle}</h2>{session.responses.map((response, index) => { const question = questionById.get(response.questionId)!; return <details key={response.questionId} className="review-item"><summary><span className={response.correct ? 'review-correct' : 'review-incorrect'}>{response.correct ? <Check size={18}/> : <RotateCcw size={18}/>}</span><span>Pregunta {index + 1} · {response.correct ? 'Correcta' : t.reviewWrong}</span><ChevronRight size={18}/></summary><div className="review-body"><Markdown>{question.prompt}</Markdown><p><strong>Tu respuesta:</strong> {response.selectedIds.join(', ')} · <strong>Correcta:</strong> {question.correctIds.join(', ')}</p><ul>{question.options.filter(option => question.correctIds.includes(option.id)).map(option => <li key={option.id}><Markdown>{`${option.id}. ${option.text}`}</Markdown></li>)}</ul><Markdown>{question.explanation}</Markdown><p className="question-source">{question.sourceUrl ? <a href={question.sourceUrl} target="_blank" rel="noreferrer">{question.sourceLabel}<ExternalLink size={14}/></a> : question.sourceLabel}</p></div></details>; })}</section></> : null}
    </div>;
  }
  function renderProgress() {
    return <>{heading(t.progressEyebrow, loadFailure ? 'Recupera tu progreso' : t.progressTitle, loadFailure ? 'Tus datos guardados se conservaron. Puedes restaurar un respaldo válido.' : t.progressSubtitle)}
      {!loadFailure && <><section className="stat-grid" aria-label="Estadísticas"><div className="stat-tile"><Sparkles/><strong>{progress.xp}</strong><span>XP acumulados</span></div><div className="stat-tile"><BookOpen/><strong>{progress.completedLessons.length}<small> / {curriculum.lessons.length}</small></strong><span>Lecciones completadas</span></div><div className="stat-tile"><Flame/><strong>{shownStreak(progress)}<small> {plural(shownStreak(progress), 'día', 'días')}</small></strong><span>Racha actual · mejor: {progress.streak.best}</span></div><div className="stat-tile"><CheckCircle2/><strong>{answerStats.attempts ? `${Math.round(answerStats.correct / answerStats.attempts * 100)}%` : '—'}</strong><span>{answerStats.attempts} {plural(answerStats.attempts, 'respuesta', 'respuestas')} · {answerStats.correct} {plural(answerStats.correct, 'acierto', 'aciertos')}</span></div></section><section className="panel paper progress-worlds"><h2>{t.progressWorlds}</h2>{curriculum.worlds.map(world => { const lessons = curriculum.lessons.filter(lesson => lesson.worldId === world.id); const done = lessons.filter(lesson => progress.completedLessons.includes(lesson.id)).length; return <div className="world-progress" key={world.id}><div><strong>{world.id}. {world.title}</strong><span>{done} / {lessons.length}</span></div><progress value={done} max={lessons.length} aria-label={`${world.title}: ${done} de ${lessons.length} lecciones`}/></div>; })}<p className="helper">{progress.completedMatching.length} de {curriculum.matches.length} conjuntos de parejas completados · {mistakeCount} {plural(mistakeCount, 'pregunta de práctica para repasar', 'preguntas de práctica para repasar')}.</p><details className="how-progress"><summary>{t.progressHow}</summary><p>Tu primer acierto en una pregunta suma 10 XP; los siguientes, 5 XP. Las respuestas incorrectas no restan. La racha aumenta al practicar en días consecutivos. Una lección se completa al llegar a sus resultados, y las parejas registran conjuntos completados.</p></details></section></>}
      <div className="settings-grid"><section className="panel paper"><div className="section-heading"><h2>Tu respaldo personal</h2><ShieldCheck size={25}/></div><p>Exporta un archivo JSON para conservar tu avance o llevarlo a otro dispositivo.</p><p className="helper">{isNative ? 'Android: «Guardar o compartir» abre el menú del sistema para elegir una app o ubicación.' : 'Navegador: «Descargar respaldo» guarda un archivo en tus descargas.'}</p><div className="button-row"><button className="button ink" disabled={!!loadFailure || exportBusy} onClick={downloadBackup}><Download size={18}/>{exportBusy ? 'Preparando…' : isNative ? 'Guardar o compartir' : 'Descargar respaldo'}</button><button className="button outline" disabled={importReading || importBusy} onClick={() => { setImportError(''); fileInput.current?.click(); }}><Upload size={18}/>{importReading ? 'Leyendo archivo…' : 'Importar JSON'}</button></div><input ref={fileInput} type="file" accept={isNative ? '*/*' : '.json,application/json'} className="sr-only" tabIndex={-1} aria-label="Seleccionar respaldo de Pliegue IA" onChange={readImport}/><p className="small-note">{isNative && 'Elige tu archivo de respaldo JSON en el selector de Android. '}Importar reemplaza el progreso de este dispositivo. Primero validaremos el archivo y te pediremos confirmar.</p>{importError && <p className="inline-error" role="alert">{importError}</p>}</section><section className="panel paper"><h2>A tu ritmo</h2><PacePanel focus={focus} level={soundLevel(prefs)} music={prefs.music} reducedMotion={progress.settings.reducedMotion} disabled={!!loadFailure} onFocus={chooseFocus} onSound={chooseSound} onSample={play} onMusic={value => changePrefs(current => ({ ...current, music: value }))} onReducedMotion={value => changeProgress(current => ({ ...current, settings: { ...current.settings, reducedMotion: value } }))}/><p className="small-note">{loading ? 'Abriendo progreso…' : loadFailure ? 'Progreso pendiente de recuperación.' : saving ? 'Guardando cambios…' : saveFailure ? 'Hay cambios pendientes de guardar.' : 'Progreso guardado en este dispositivo.'}</p>{!isNative && <><a className="button outline" href={`${import.meta.env.BASE_URL}downloads/pliegue-ia.apk`} download><Download size={18}/>Descargar APK para Android</a><p className="small-note">Android 7.0 o posterior. Instala el APK para estudiar desde la app.</p></>}</section></div>
      <section className="content-footnote"><h2>Una ruta basada en tus materiales</h2><p>{curriculum.worlds.length} mundos · {curriculum.units.length} unidades · {curriculum.lessons.length} lecciones · {practiceQuestions.length} preguntas de práctica · {examQuestions.length} de simulacro.</p><p>Contenido: {curriculum.sourceDate}. Cada lección y pregunta conserva su referencia. Los enlaces a las fuentes requieren conexión; la práctica usa contenido incluido en la app.</p></section></>;
  }

  return <div className="app-shell" data-reduced-motion={loading || calm} data-focus={loading || focus} data-immersive={immersive}><a className="skip-link" href="#main-content">Saltar al contenido</a><aside className="sidebar"><button className="brand" onClick={() => navigate('learn')} aria-label="Pliegue IA, ir a aprender"><img src={asset('favicon.svg')} alt=""/><span>pliegue<span className="brand-ia">ia</span></span></button><div className="brand-caption">IDEAS QUE TOMAN FORMA</div><nav aria-label="Principal">{navigation.map(({ page: item, label, short, Icon }) => <button key={item} className={`nav-item ${activePage === item ? 'active' : ''}`} aria-current={activePage === item ? 'page' : undefined} aria-label={short === label ? label : `${short}: ${label}`} title={label} onClick={() => navigate(loadFailure ? 'progress' : item)} disabled={loading}><Icon/><span className="nav-label">{label}</span><span className="nav-short" aria-hidden="true">{short}</span></button>)}</nav><div className="sidebar-bottom"><span className="course-label">TU RUTA</span><strong>Generative AI Leader</strong><p>{curriculum.lessons.length} pequeñas lecciones.<br/>Un mundo de posibilidades.</p><div className="sidebar-progress"><progress max={curriculum.lessons.length} value={progress.completedLessons.length} aria-label="Lecciones completadas"/><span>{progress.completedLessons.length} de {curriculum.lessons.length} completadas</span></div></div></aside><main className="main" id="main-content" tabIndex={-1}><header className="topbar"><span>{focus ? immersive ? '' : `${doneLessons} de ${curriculum.lessons.length} lecciones` : 'APRENDE A TU RITMO'}</span><div className="stats"><span title="Racha de estudio"><Flame size={19}/>{shownStreak(progress)} {shownStreak(progress) === 1 ? 'día' : 'días'}</span><span title="Experiencia acumulada"><Sparkles size={19}/>{progress.xp} XP</span></div>{!loading && <TopbarControls muted={prefs.muted} focus={focus} onMute={() => changePrefs(current => ({ ...current, muted: !current.muted }))} onFocus={() => chooseFocus(!focus)}/>}</header>
    {loading ? <section className="loading-panel" role="status"><LoaderCircle className="spinning"/><p>{t.loading}</p></section> : <>
    {loadFailure && <div className="status-banner error" role="alert"><ShieldCheck size={21}/><div><strong>No pudimos abrir el progreso guardado.</strong><p>{loadFailure}</p></div></div>}
    {saveFailure && <div className="status-banner error" role="alert"><div><strong>No se pudo guardar el último cambio.</strong><p>{saveFailure} Mantén la app abierta y reintenta, o exporta un respaldo desde Mi progreso.</p></div><button className="button outline" onClick={() => persist(progressRef.current)}>Reintentar guardado</button></div>}
    {notice && <div className="status-banner" role="status"><p>{notice}</p><button className="icon-button" onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={19}/></button></div>}
    {session && page !== 'session' && page !== 'learn' && !inRound && !loadFailure && <div className="resume-banner"><span><strong>{session.stage === 'results' ? 'Resultados listos' : 'Tienes una sesión guardada'}</strong><small>{session.responses.length} de {session.questionIds.length} {plural(session.questionIds.length, 'pregunta respondida', 'preguntas respondidas')}</small></span><button className="text-button" onClick={() => navigate('session')}>{session.stage === 'results' ? 'Ver resultados' : 'Continuar'}</button></div>}
    {loadFailure ? renderProgress() : page === 'learn' ? renderLearn() : page === 'quick' ? renderQuick() : page === 'exam' ? renderExam() : page === 'matching' ? renderMatching() : page === 'session' ? renderSession() : renderProgress()}
    </>}
  </main>
  {reelUnit && <ReelViewer key={reelUnit.id} reel={reelByUnit.get(reelUnit.id)!} reduced={calm} sound={{ muted: prefs.muted, music: prefs.music && !focus, onMute: () => { if (prefs.muted) unlockAudio(); changePrefs(current => ({ ...current, muted: !current.muted })); }, onMusic: () => changePrefs(current => ({ ...current, music: !current.music })) }} onClose={() => setReelUnit(null)} onStartUnit={() => startUnit(reelUnit)}/>}
  {pendingSession && <Confirmation title={t.newSessionTitle} confirm={t.newSessionConfirm} onConfirm={() => activateSession(pendingSession)} onCancel={() => setPendingSession(null)}><p>{t.newSessionBody(session?.responses.length ?? 0, session?.questionIds.length ?? 0)}</p><p>{t.newSessionKept}</p><button className="text-button" onClick={() => { setPendingSession(null); navigate('session'); }}>{t.newSessionKeep}</button></Confirmation>}
  {pendingImport && <Confirmation title="¿Restaurar este respaldo?" confirm="Reemplazar mi progreso" onConfirm={() => void confirmImport()} onCancel={() => setPendingImport(null)} busy={importBusy}><p className="backup-filename">{pendingImport.name}</p><p>Archivo validado: <strong>{pendingImport.progress.completedLessons.length} {plural(pendingImport.progress.completedLessons.length, 'lección', 'lecciones')}</strong>, <strong>{pendingImport.progress.xp} XP</strong> y {pendingImport.progress.activeSession ? 'una sesión guardada' : 'ninguna sesión pendiente'}.</p><p>Esto reemplazará el progreso actual de este dispositivo. Puedes cancelar y exportar primero una copia de tu avance actual.</p></Confirmation>}
  </div>;
}
