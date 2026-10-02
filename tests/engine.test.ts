import assert from 'node:assert/strict';
import test from 'node:test';
import type { Curriculum, Progress, Question } from '../src/types';
import { completeLesson, isCorrect, makeBackup, newProgress, parseBackup, recordAnswer, selectQuestions, shuffle, startSession, validateProgress } from '../src/lib/engine';

const question = (id: string, overrides: Partial<Question> = {}): Question => ({
  id, unitId: 'u1', lessonIds: ['l1'], kind: 'single', prompt: id,
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }],
  correctIds: ['a'], explanation: 'Por qué', exam: false, sourceLabel: 'Material', ...overrides,
});
const practice = [question('q1'), question('q2'), question('q3', { lessonIds: ['l2'] }), question('q4', { unitId: 'u2', lessonIds: ['l3'] })];
const exams = Array.from({ length: 40 }, (_, i) => question(`exam-${i}`, { exam: true, unitId: null, lessonIds: [] }));
const curriculum: Curriculum = {
  version: 'test-v1', sourceDate: '2026-10-01', worlds: [], units: [], matches: [{ id: 'm1', unitId: 'u1', title: 'Pares', pairs: [] }],
  lessons: [
    { id: 'l1', unitId: 'u1', worldId: 1, title: 'Uno', idea: '', keyPoints: [], example: '', distinctions: '', sourceUrl: '' },
    { id: 'l2', unitId: 'u1', worldId: 1, title: 'Dos', idea: '', keyPoints: [], example: '', distinctions: '', sourceUrl: '' },
  ], questions: [...practice, ...exams],
};
const date = (day: number, hour = 12) => new Date(2026, 9, day, hour);
const fresh = () => newProgress(curriculum.version);

test('exact set grading rejects omitted, extra, duplicate, and unknown options', () => {
  const multiple = question('multi', { kind: 'multiple', correctIds: ['a', 'c'] });
  assert.equal(isCorrect(multiple, ['c', 'a']), true);
  for (const ids of [[], ['a'], ['a', 'a'], ['a', 'c', 'b'], ['a', 'unknown']]) assert.equal(isCorrect(multiple, ids), false);
  assert.equal(isCorrect(practice[0], ['a', 'b']), false);
});

test('quick/lesson practice never leaks exam questions; lesson uses its unit fallback without duplicates', () => {
  const all = [...curriculum.questions, practice[0]];
  const quick = selectQuestions(all, { count: 50 }, () => 0.5);
  assert.deepEqual(new Set(quick.map(q => q.id)), new Set(practice.map(q => q.id)));
  const lesson = selectQuestions(all, { count: 8, lessonId: 'l1', unitId: 'u1' }, () => 0.5);
  assert.deepEqual(new Set(lesson.slice(0, 2).map(q => q.id)), new Set(['q1', 'q2']));
  assert.equal(lesson[2].id, 'q3');
  assert.equal(lesson.length, 3);
  assert.deepEqual(selectQuestions(all, { count: 5, lessonId: 'missing' }), []);
});

test('mistake practice contains only currently incorrect practice answers', () => {
  let progress = recordAnswer(fresh(), practice[0], ['b'], date(1));
  progress = recordAnswer(progress, practice[1], ['b'], date(1));
  progress = recordAnswer(progress, practice[1], ['a'], date(1));
  progress = recordAnswer(progress, exams[0], ['b'], date(1));
  assert.deepEqual(selectQuestions(curriculum.questions, { count: 8, mistakesOnly: true, progress }).map(q => q.id), ['q1']);
});

test('exam selects exactly 40 unique exam questions and startSession preserves that order', () => {
  const chosen = selectQuestions(curriculum.questions, { count: 5, exam: true }, () => 0.25);
  assert.equal(chosen.length, 40);
  assert.equal(new Set(chosen.map(q => q.id)).size, 40);
  assert.ok(chosen.every(q => q.exam));
  const session = startSession('exam', chosen, undefined, date(1));
  assert.deepEqual(session.questionIds, chosen.map(q => q.id));
  assert.equal(session.stage, 'question');
  assert.throws(() => selectQuestions(exams.slice(1), { count: 40, exam: true }), /40/);
  assert.throws(() => startSession('quick', exams), /reservadas/);
});

test('shuffle copies the input and rejects invalid RNG values', () => {
  const source = [1, 2, 3, 4];
  assert.deepEqual(shuffle(source, () => 0), [2, 3, 4, 1]);
  assert.deepEqual(source, [1, 2, 3, 4]);
  assert.throws(() => shuffle(source, () => 1), /aleatorio/);
});

test('XP is only awarded for correct answers: 10 first success, 5 subsequent successes', () => {
  const original = fresh();
  let progress = recordAnswer(original, practice[0], ['b'], date(1));
  assert.equal(progress.xp, 0);
  progress = recordAnswer(progress, practice[0], ['a'], date(1));
  assert.equal(progress.xp, 10);
  progress = recordAnswer(progress, practice[0], ['a'], date(1));
  assert.equal(progress.xp, 15);
  assert.equal(progress.answers.q1.attempts, 3);
  assert.equal(progress.answers.q1.correct, 2);
  assert.deepEqual(original, fresh());
});

test('answer commits feedback atomically and reload cannot score the same answer twice', () => {
  let progress: Progress = { ...fresh(), activeSession: startSession('quick', practice.slice(0, 2), undefined, date(1)) };
  progress = recordAnswer(progress, practice[0], ['a'], date(1));
  const restored = parseBackup(JSON.stringify(makeBackup(progress)), curriculum);
  assert.equal(restored.activeSession?.id, progress.activeSession?.id);
  assert.deepEqual(restored.activeSession?.questionIds, ['q1', 'q2']);
  assert.equal(restored.activeSession?.stage, 'feedback');
  const repeated = recordAnswer(restored, practice[0], ['a'], date(1));
  assert.equal(repeated, restored);
  assert.equal(repeated.xp, 10);
  assert.equal(repeated.answers.q1.attempts, 1);
  assert.throws(() => recordAnswer(restored, practice[1], ['a'], date(1)), /sesión activa/);
});

test('local-date streak updates on answers, once a day, across midnight and missed days', () => {
  let progress = fresh();
  assert.equal(startSession('quick', practice).stage, 'question');
  assert.equal(progress.streak.current, 0);
  progress = recordAnswer(progress, practice[0], ['b'], date(1, 23));
  progress = recordAnswer(progress, practice[0], ['b'], date(1, 23));
  assert.equal(progress.streak.current, 1);
  progress = recordAnswer(progress, practice[0], ['b'], date(2, 0));
  assert.equal(progress.streak.current, 2);
  progress = recordAnswer(progress, practice[0], ['b'], date(4));
  assert.deepEqual(progress.streak, { current: 1, best: 2, lastStudyDate: '2026-10-04' });
  progress = recordAnswer(progress, practice[0], ['b'], date(3));
  assert.equal(progress.streak.lastStudyDate, '2026-10-04');
});

test('lesson completion is idempotent and does not alter XP or streak', () => {
  const first = completeLesson(fresh(), 'l1');
  const second = completeLesson(first, 'l1');
  assert.equal(second, first);
  assert.deepEqual(second.completedLessons, ['l1']);
  assert.equal(second.xp, 0);
  assert.equal(second.streak.current, 0);
});

test('backups round-trip all session stages, selections, settings, and matching progress', () => {
  let progress: Progress = { ...fresh(), settings: { reducedMotion: true }, completedMatching: ['m1'], activeSession: startSession('lesson', [practice[0]], 'l1', date(1)) };
  assert.deepEqual(parseBackup(JSON.stringify(makeBackup(progress)), curriculum), progress);
  progress = { ...progress, activeSession: { ...progress.activeSession!, stage: 'question', selectedIds: ['a'] } };
  assert.deepEqual(validateProgress(progress, curriculum), progress);
  progress = recordAnswer(progress, practice[0], ['a'], date(1));
  assert.deepEqual(validateProgress(progress, curriculum), progress);
  progress = { ...progress, activeSession: { ...progress.activeSession!, stage: 'results', index: 1, selectedIds: [] } };
  assert.deepEqual(validateProgress(progress, curriculum), progress);
});

test('corrupt backups reject wrong versions, IDs, counters, dates, fields and inconsistent sessions', () => {
  assert.throws(() => parseBackup('{broken', curriculum), /JSON/);
  const mutations: ((p: Progress) => void)[] = [
    p => { p.contentVersion = 'future'; },
    p => { p.xp = -1; },
    p => { p.completedLessons = ['unknown']; },
    p => { p.completedLessons = ['l1', 'l1']; },
    p => { p.completedMatching = ['unknown']; },
    p => { p.streak = { current: 1, best: 0, lastStudyDate: '2026-10-01' }; },
    p => { p.streak = { current: 1, best: 1, lastStudyDate: '2026-02-30' }; },
    p => { (p as unknown as Record<string, unknown>).unexpected = true; },
    p => { p.answers.q1 = { attempts: 1, correct: 2, lastCorrect: true, lastAnsweredAt: date(1).toISOString() }; },
    p => { p.activeSession = startSession('quick', [practice[0]], undefined, date(1)); p.activeSession.index = 1; },
    p => { p.activeSession = startSession('quick', [practice[0]], undefined, date(1)); p.activeSession.stage = 'feedback'; },
    p => { p.activeSession = startSession('quick', [practice[0]], undefined, date(1)); p.activeSession.selectedIds = ['unknown']; },
  ];
  for (const mutate of mutations) { const progress = fresh(); mutate(progress); assert.throws(() => parseBackup(JSON.stringify(makeBackup(progress)), curriculum), /no válido/); }
  let answered: Progress = { ...fresh(), activeSession: startSession('quick', [practice[0]], undefined, date(1)) };
  answered = recordAnswer(answered, practice[0], ['a'], date(1));
  answered.activeSession!.responses[0].correct = false;
  assert.throws(() => validateProgress(answered, curriculum), /resultado de respuesta/);
});
