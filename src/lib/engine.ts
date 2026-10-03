import type { Backup, Curriculum, Progress, Question, Session, SessionMode } from '../types';

export interface QuestionSelection {
  count: number;
  unitId?: string;
  mistakesOnly?: boolean;
  progress?: Progress;
  lessonId?: string;
  exam?: boolean;
}

export function newProgress(contentVersion: string): Progress {
  return {
    schemaVersion: 1, contentVersion, xp: 0, completedLessons: [], answers: {},
    streak: { current: 0, best: 0, lastStudyDate: null },
    settings: { reducedMotion: false }, activeSession: null, completedMatching: [],
  };
}

function validSelection(question: Question, ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length && ids.every(id => question.options.some(option => option.id === id));
}

export function isCorrect(question: Question, selectedIds: string[]): boolean {
  return validSelection(question, selectedIds)
    && selectedIds.length === question.correctIds.length
    && question.correctIds.every(id => selectedIds.includes(id));
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('El generador aleatorio debe devolver un valor entre 0 y 1.');
    const j = Math.floor(random * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectQuestions(questions: readonly Question[], options: QuestionSelection, rng: () => number = Math.random): Question[] {
  if (!Number.isSafeInteger(options.count) || options.count < 1) throw new Error('La cantidad de preguntas debe ser positiva.');
  const unique = [...new Map(questions.map(question => [question.id, question])).values()];
  if (options.exam) {
    const examQuestions = unique.filter(question => question.exam);
    if (examQuestions.length < 40) throw new Error('El simulacro necesita al menos 40 preguntas de examen.');
    return shuffle(examQuestions, rng).slice(0, 40);
  }
  const eligible = unique.filter(question => !question.exam && (!options.unitId || question.unitId === options.unitId)
    && (!options.mistakesOnly || options.progress?.answers[question.id]?.lastCorrect === false));
  if (options.lessonId) {
    const related = eligible.filter(question => question.lessonIds.includes(options.lessonId!));
    const unitId = options.unitId ?? related.find(question => question.unitId)?.unitId;
    const relatedIds = new Set(related.map(question => question.id));
    const fallback = unitId ? eligible.filter(question => question.unitId === unitId && !relatedIds.has(question.id)) : [];
    return [...shuffle(related, rng), ...shuffle(fallback, rng)].slice(0, options.count);
  }
  return shuffle(eligible, rng).slice(0, options.count);
}

export function startSession(mode: SessionMode, questions: readonly Question[], lessonId?: string, now: Date = new Date()): Session {
  if (!questions.length || new Set(questions.map(question => question.id)).size !== questions.length) throw new Error('La sesión necesita preguntas únicas.');
  if (mode === 'exam' && (questions.length !== 40 || questions.some(question => !question.exam))) throw new Error('El simulacro necesita exactamente 40 preguntas de examen.');
  if (mode !== 'exam' && questions.some(question => question.exam)) throw new Error('Las preguntas de examen están reservadas para el simulacro.');
  if (mode === 'lesson' && !lessonId) throw new Error('Falta la lección de esta sesión.');
  if (mode !== 'lesson' && lessonId) throw new Error('Este modo no admite una lección.');
  return {
    id: globalThis.crypto.randomUUID(), mode, ...(lessonId ? { lessonId } : {}),
    questionIds: questions.map(question => question.id), index: 0, responses: [],
    startedAt: now.toISOString(), stage: mode === 'lesson' ? 'intro' : 'question', selectedIds: [],
  };
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Counts today as a study day. Practice that keeps no answers (cards, yes or no) calls it directly.
export function touchStreak(progress: Progress, now: Date = new Date()): Progress {
  const today = localDate(now);
  const lastDay = progress.streak.lastStudyDate;
  if (lastDay !== null && today <= lastDay) return progress;
  const previousDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const current = lastDay === localDate(previousDate) ? progress.streak.current + 1 : 1;
  return { ...progress, streak: { current, best: Math.max(progress.streak.best, current), lastStudyDate: today } };
}

export function recordAnswer(progress: Progress, question: Question, selectedIds: string[], now: Date = new Date()): Progress {
  if (!validSelection(question, selectedIds)) throw new Error('La respuesta contiene opciones desconocidas o repetidas.');
  const session = progress.activeSession;
  if (session) {
    if (session.questionIds[session.index] !== question.id) throw new Error('La pregunta no corresponde a la sesión activa.');
    if (session.responses.some(response => response.questionId === question.id)) return progress;
    if (session.stage !== 'question') throw new Error('La sesión no está esperando una respuesta.');
  }
  const correct = isCorrect(question, selectedIds);
  const previous = progress.answers[question.id];
  return {
    ...touchStreak(progress, now),
    xp: progress.xp + (correct ? (previous?.correct ? 5 : 10) : 0),
    answers: { ...progress.answers, [question.id]: {
      attempts: (previous?.attempts ?? 0) + 1,
      correct: (previous?.correct ?? 0) + Number(correct), lastCorrect: correct, lastAnsweredAt: now.toISOString(),
    } },
    activeSession: session ? {
      ...session, stage: 'feedback', selectedIds: [...selectedIds],
      responses: [...session.responses, { questionId: question.id, selectedIds: [...selectedIds], correct }],
    } : null,
  };
}

export function completeLesson(progress: Progress, lessonId: string): Progress {
  return progress.completedLessons.includes(lessonId) ? progress : { ...progress, completedLessons: [...progress.completedLessons, lessonId] };
}

function invalid(detail: string): never { throw new Error(`Respaldo o progreso no válido: ${detail}.`); }
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(name);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], name: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid(`${name} contiene campos desconocidos`);
}
function integer(value: unknown, name: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) invalid(name);
  return value;
}
function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string') || new Set(value).size !== value.length) invalid(name);
  return value as string[];
}
function timestamp(value: unknown, name: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid(name);
  return value;
}
function knownIds(value: unknown, allowed: Set<string>, name: string): string[] {
  const ids = strings(value, name);
  if (ids.some(id => !allowed.has(id))) invalid(`${name} contiene identificadores desconocidos`);
  return ids;
}

export function validateProgress(value: unknown, curriculum: Curriculum): Progress {
  const data = object(value, 'estructura de progreso');
  keys(data, ['schemaVersion', 'contentVersion', 'xp', 'completedLessons', 'answers', 'streak', 'settings', 'activeSession', 'completedMatching'], 'progreso');
  if (data.schemaVersion !== 1 || data.contentVersion !== curriculum.version) invalid('versión incompatible');
  const questions = new Map(curriculum.questions.map(question => [question.id, question]));
  const lessons = new Map(curriculum.lessons.map(lesson => [lesson.id, lesson]));
  integer(data.xp, 'XP');
  knownIds(data.completedLessons, new Set(lessons.keys()), 'lecciones completadas');
  knownIds(data.completedMatching, new Set(curriculum.matches.map(match => match.id)), 'parejas completadas');
  const answers = object(data.answers, 'respuestas');
  for (const [id, raw] of Object.entries(answers)) {
    if (!questions.has(id)) invalid('pregunta desconocida en respuestas');
    const answer = object(raw, 'respuesta');
    keys(answer, ['attempts', 'correct', 'lastCorrect', 'lastAnsweredAt'], 'respuesta');
    const attempts = integer(answer.attempts, 'intentos', 1);
    const correct = integer(answer.correct, 'aciertos');
    if (correct > attempts || typeof answer.lastCorrect !== 'boolean' || (answer.lastCorrect && correct === 0) || (!answer.lastCorrect && correct === attempts)) invalid('contadores de respuesta inconsistentes');
    timestamp(answer.lastAnsweredAt, 'fecha de respuesta');
  }
  const streak = object(data.streak, 'racha');
  keys(streak, ['current', 'best', 'lastStudyDate'], 'racha');
  const current = integer(streak.current, 'racha actual');
  const best = integer(streak.best, 'mejor racha');
  if (best < current) invalid('mejor racha menor que racha actual');
  if (streak.lastStudyDate !== null) {
    if (typeof streak.lastStudyDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(streak.lastStudyDate)) invalid('fecha de racha');
    const date = new Date(`${streak.lastStudyDate}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== streak.lastStudyDate || current < 1) invalid('fecha de racha');
  } else if (current !== 0 || best !== 0 || Object.keys(answers).length > 0) invalid('racha sin fecha de estudio');
  const settings = object(data.settings, 'ajustes');
  keys(settings, ['reducedMotion'], 'ajustes');
  if (typeof settings.reducedMotion !== 'boolean') invalid('movimiento reducido');
  if (data.activeSession !== null) {
    const session = object(data.activeSession, 'sesión');
    keys(session, ['id', 'mode', 'lessonId', 'questionIds', 'index', 'responses', 'startedAt', 'stage', 'selectedIds'], 'sesión');
    if (typeof session.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session.id)) invalid('ID de sesión');
    if (!['lesson', 'quick', 'exam'].includes(session.mode as string)) invalid('modo de sesión');
    if (session.lessonId !== undefined && (typeof session.lessonId !== 'string' || !lessons.has(session.lessonId))) invalid('lección de sesión');
    if (session.mode === 'lesson' && !session.lessonId) invalid('sesión sin lección');
    if (session.mode !== 'lesson' && session.lessonId !== undefined) invalid('lección en modo incompatible');
    const ids = knownIds(session.questionIds, new Set(questions.keys()), 'preguntas de sesión');
    if (!ids.length || (session.mode === 'exam' && (ids.length !== 40 || ids.some(id => !questions.get(id)!.exam)))) invalid('preguntas de simulacro');
    if (session.mode !== 'exam' && ids.some(id => questions.get(id)!.exam)) invalid('pregunta de examen fuera del simulacro');
    if (session.mode === 'lesson' && ids.some(id => questions.get(id)!.unitId !== lessons.get(session.lessonId as string)!.unitId)) invalid('pregunta fuera de la unidad');
    const index = integer(session.index, 'posición de sesión');
    if (!['intro', 'question', 'feedback', 'results'].includes(session.stage as string)) invalid('fase de sesión');
    if (index >= ids.length && !(session.stage === 'results' && index === ids.length)) invalid('posición de sesión fuera de rango');
    timestamp(session.startedAt, 'inicio de sesión');
    if (!Array.isArray(session.responses)) invalid('respuestas de sesión');
    const responses = session.responses;
    if (responses.length > ids.length) invalid('demasiadas respuestas');
    for (let position = 0; position < responses.length; position++) {
      const response = object(responses[position], 'respuesta de sesión');
      keys(response, ['questionId', 'selectedIds', 'correct'], 'respuesta de sesión');
      if (response.questionId !== ids[position]) invalid('orden de respuestas');
      const question = questions.get(ids[position])!;
      const selected = strings(response.selectedIds, 'opciones de respuesta');
      if (!validSelection(question, selected) || response.correct !== isCorrect(question, selected)) invalid('resultado de respuesta');
      const recorded = answers[question.id] as Progress['answers'][string] | undefined;
      if (!recorded || recorded.lastCorrect !== response.correct) invalid('respuesta de sesión sin progreso correspondiente');
    }
    if (session.stage === 'intro' && (session.mode !== 'lesson' || index !== 0 || responses.length !== 0)) invalid('introducción inconsistente');
    if (session.stage === 'question' && responses.length !== index) invalid('pregunta ya contestada');
    if (session.stage === 'feedback' && responses.length !== index + 1) invalid('feedback sin respuesta');
    if (session.stage === 'results' && (responses.length !== ids.length || index < ids.length - 1)) invalid('resultados incompletos');
    const selection = strings(session.selectedIds, 'selección activa');
    if (!validSelection(questions.get(ids[Math.min(index, ids.length - 1)])!, selection)) invalid('selección activa desconocida');
    if (session.stage === 'intro' && selection.length) invalid('introducción con respuesta');
    if (session.stage === 'feedback') {
      const response = responses[index] as Session['responses'][number];
      if (selection.length !== response.selectedIds.length || selection.some(id => !response.selectedIds.includes(id))) invalid('feedback y selección diferentes');
    }
  }
  return JSON.parse(JSON.stringify(data)) as Progress;
}

export function makeBackup(progress: Progress): Backup {
  return { app: 'pliegue-ia', schemaVersion: 1, exportedAt: new Date().toISOString(), progress: JSON.parse(JSON.stringify(progress)) as Progress };
}

export function parseBackup(text: string, curriculum: Curriculum): Progress {
  if (text.length > 5_000_000) invalid('archivo demasiado grande');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { invalid('JSON ilegible'); }
  const backup = object(parsed, 'respaldo');
  keys(backup, ['app', 'schemaVersion', 'exportedAt', 'progress'], 'respaldo');
  if (backup.app !== 'pliegue-ia' || backup.schemaVersion !== 1) invalid('aplicación o versión del respaldo');
  timestamp(backup.exportedAt, 'fecha de exportación');
  return validateProgress(backup.progress, curriculum);
}
