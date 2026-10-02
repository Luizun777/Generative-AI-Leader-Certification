import assert from 'node:assert/strict';
import test from 'node:test';
import type { Curriculum } from '../src/types';
import { newProgress, recordAnswer, startSession } from '../src/lib/engine';
import { createProgressStore } from '../src/lib/storage';

const curriculum: Curriculum = { version: 'test-v1', sourceDate: '2026-10-01', worlds: [], units: [], lessons: [], matches: [], questions: [{ id: 'q1', unitId: null, lessonIds: [], kind: 'single', prompt: 'Uno', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctIds: ['a'], explanation: '', exam: false, sourceLabel: '' }] };
const fresh = () => newProgress(curriculum.version);

test('empty storage initializes without writing and saved session reloads unchanged', async () => {
  let value: string | null = null;
  let writes = 0;
  const store = createProgressStore({ get: async () => ({ value }), set: async options => { value = options.value; writes++; } });
  assert.deepEqual(await store.loadProgress(curriculum), fresh());
  assert.equal(writes, 0);
  const progress = recordAnswer({ ...fresh(), activeSession: startSession('quick', curriculum.questions) }, curriculum.questions[0], ['a']);
  await store.saveProgress(progress);
  assert.deepEqual(await store.loadProgress(curriculum), progress);
  assert.equal(recordAnswer(await store.loadProgress(curriculum), curriculum.questions[0], ['a']).xp, 10);
});

test('write queue preserves call order despite latency and snapshots mutable callers immediately', async () => {
  let value: string | null = null;
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writes: number[] = [];
  const store = createProgressStore({ get: async () => ({ value }), set: async options => {
    const parsed = JSON.parse(options.value);
    if (parsed.xp === 1) await gate;
    value = options.value;
    writes.push(parsed.xp);
  } });
  await store.loadProgress(curriculum);
  const first = { ...fresh(), xp: 1 };
  const a = store.saveProgress(first);
  first.xp = 999;
  const b = store.saveProgress({ ...fresh(), xp: 2 });
  await Promise.resolve();
  assert.deepEqual(writes, []);
  release();
  await Promise.all([a, b]);
  assert.deepEqual(writes, [1, 2]);
  assert.equal((await store.loadProgress(curriculum)).xp, 2);
});

test('corrupt stored data is preserved and explicit validated restore recovers it', async () => {
  let value = '{corrupt';
  let writes = 0;
  const store = createProgressStore({ get: async () => ({ value }), set: async options => { value = options.value; writes++; } });
  await assert.rejects(store.loadProgress(curriculum), /conservó intacto/);
  await assert.rejects(store.saveProgress(fresh()), /no se sobrescribirá/);
  await assert.rejects(store.restoreProgress({ ...fresh(), contentVersion: 'wrong' }, curriculum), /versión incompatible/);
  assert.equal(value, '{corrupt');
  assert.equal(writes, 0);
  await store.restoreProgress(fresh(), curriculum);
  assert.equal(writes, 1);
  assert.deepEqual(await store.loadProgress(curriculum), fresh());
  await store.saveProgress({ ...fresh(), settings: { reducedMotion: true } });
  assert.equal((await store.loadProgress(curriculum)).settings.reducedMotion, true);
});

test('write errors reach caller and do not prevent later valid retries', async () => {
  let value: string | null = null;
  let fail = true;
  const store = createProgressStore({ get: async () => ({ value }), set: async options => { if (fail) { fail = false; throw new Error('Disk full'); } value = options.value; } });
  await store.loadProgress(curriculum);
  await assert.rejects(store.saveProgress(fresh()), /Disk full/);
  await store.saveProgress(fresh());
  assert.deepEqual(await store.loadProgress(curriculum), fresh());
});

test('saving without first reading or with invalid state cannot overwrite existing progress', async () => {
  let writes = 0;
  const store = createProgressStore({ get: async () => ({ value: null }), set: async () => { writes++; } });
  await assert.rejects(store.saveProgress(fresh()), /Primero carga/);
  await store.loadProgress(curriculum);
  await assert.rejects(store.saveProgress({ ...fresh(), xp: Number.NaN }), /XP/);
  assert.equal(writes, 0);
});

test('a failed storage read cannot be followed by an automatic overwrite', async () => {
  let writes = 0;
  const store = createProgressStore({ get: async () => { throw new Error('Read unavailable'); }, set: async () => { writes++; } });
  await assert.rejects(store.loadProgress(curriculum), /Read unavailable/);
  await assert.rejects(store.saveProgress(fresh()), /Primero carga/);
  assert.equal(writes, 0);
});
