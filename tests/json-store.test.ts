import assert from 'node:assert/strict';
import test from 'node:test';
import { createJsonStore } from '../src/lib/json-store';

interface Sample { count: number }
const sanitize = (raw: unknown): Sample => {
  const count = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).count : undefined;
  return { count: typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 0 };
};
const memory = (initial: string | null = null) => {
  const state = { value: initial, writes: 0 };
  return { state, adapter: { get: async () => ({ value: state.value }), set: async (options: { key: string; value: string }) => { state.value = options.value; state.writes++; } } };
};

test('empty storage loads defaults without writing and a saved value round-trips', async () => {
  const { state, adapter } = memory();
  const store = createJsonStore(adapter, 'k', sanitize);
  assert.deepEqual(await store.load(), { count: 0 });
  assert.equal(state.writes, 0);
  assert.equal(await store.save({ count: 3 }), true);
  assert.deepEqual(await store.load(), { count: 3 });
});

test('corrupt JSON, wrong shapes and unknown keys fall back through sanitize and can be overwritten', async () => {
  for (const stored of ['{broken', '"text"', '[1,2]', 'null', '{"count":-4}', '{"count":"7"}']) {
    const { adapter } = memory(stored);
    assert.deepEqual(await createJsonStore(adapter, 'k', sanitize).load(), { count: 0 }, stored);
  }
  const { state, adapter } = memory('{"count":2,"extra":true}');
  const store = createJsonStore(adapter, 'k', sanitize);
  assert.deepEqual(await store.load(), { count: 2 });
  assert.equal(await store.save({ count: 5 }), true);
  assert.equal(state.value, '{"count":5}');
});

test('a failed read returns defaults and blocks writes until a later read succeeds', async () => {
  let broken = true;
  let value: string | null = '{"count":9}';
  let writes = 0;
  const store = createJsonStore({
    get: async () => { if (broken) throw new Error('sin acceso'); return { value }; },
    set: async options => { value = options.value; writes++; },
  }, 'k', sanitize);
  assert.deepEqual(await store.load(), { count: 0 });
  assert.equal(await store.save({ count: 1 }), false);
  assert.equal(writes, 0);
  assert.equal(value, '{"count":9}');
  broken = false;
  assert.deepEqual(await store.load(), { count: 9 });
  assert.equal(await store.save({ count: 10 }), true);
  assert.equal(value, '{"count":10}');
});

test('writes keep call order despite latency and snapshot mutable callers immediately', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const written: number[] = [];
  const store = createJsonStore({
    get: async () => ({ value: null }),
    set: async options => { const { count } = JSON.parse(options.value) as Sample; if (count === 1) await gate; written.push(count); },
  }, 'k', sanitize);
  await store.load();
  const mutable = { count: 1 };
  const first = store.save(mutable);
  mutable.count = 99;
  const second = store.save({ count: 2 });
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(written, [1, 2]);
});

test('a rejected write reports false without poisoning later writes', async () => {
  let fail = true;
  let value: string | null = null;
  const store = createJsonStore({
    get: async () => ({ value }),
    set: async options => { if (fail) throw new Error('disco lleno'); value = options.value; },
  }, 'k', sanitize);
  await store.load();
  assert.equal(await store.save({ count: 4 }), false);
  fail = false;
  assert.equal(await store.save({ count: 6 }), true);
  assert.equal(value, '{"count":6}');
});
