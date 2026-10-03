import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrefsStore, defaultPrefs, sanitizePrefs, soundLevel, withSoundLevel } from '../src/lib/prefs';

test('defaults start silent, without focus mode and with the welcome card pending', () => {
  assert.deepEqual(defaultPrefs(), { v: 1, focus: false, sound: 'soft', muted: true, music: true, welcomed: false });
  assert.equal(soundLevel(defaultPrefs()), 'off');
});

test('sanitize never throws: each invalid field falls back alone and unknown keys are dropped', () => {
  for (const raw of [undefined, null, 'text', 7, [], [1], true]) assert.deepEqual(sanitizePrefs(raw), defaultPrefs());
  assert.deepEqual(sanitizePrefs({ v: 9, focus: true, sound: 'lively', muted: false, music: false, welcomed: true, extra: 'x', settings: {} }),
    { v: 1, focus: true, sound: 'lively', muted: false, music: false, welcomed: true });
  assert.deepEqual(sanitizePrefs({ focus: 'yes', sound: 'loud', muted: 0, music: null, welcomed: true }), { ...defaultPrefs(), welcomed: true });
  assert.deepEqual(sanitizePrefs({ sound: 'soft', muted: false }), { ...defaultPrefs(), muted: false });
});

test('muting keeps the chosen level and choosing a level unmutes', () => {
  const lively = withSoundLevel(defaultPrefs(), 'lively');
  assert.deepEqual([lively.sound, lively.muted, soundLevel(lively)], ['lively', false, 'lively']);
  const muted = withSoundLevel(lively, 'off');
  assert.deepEqual([muted.sound, muted.muted, soundLevel(muted)], ['lively', true, 'off']);
  assert.equal(soundLevel({ ...muted, muted: false }), 'lively');
  assert.equal(soundLevel(withSoundLevel(muted, 'soft')), 'soft');
});

test('the store uses its own key, tolerates corrupt data and round-trips preferences', async () => {
  const saved = new Map<string, string>([['pliegue-ia.prefs.v1', '{broken'], ['pliegue-ia.progress.v1', 'intacto']]);
  const store = createPrefsStore({ get: async ({ key }) => ({ value: saved.get(key) ?? null }), set: async ({ key, value }) => { saved.set(key, value); } });
  assert.deepEqual(await store.load(), defaultPrefs());
  const chosen = { ...withSoundLevel(defaultPrefs(), 'soft'), welcomed: true, focus: true };
  assert.equal(await store.save(chosen), true);
  assert.deepEqual(await store.load(), chosen);
  assert.equal(saved.get('pliegue-ia.progress.v1'), 'intacto');
  assert.deepEqual(Object.keys(JSON.parse(saved.get('pliegue-ia.prefs.v1')!)).sort(), ['focus', 'music', 'muted', 'sound', 'v', 'welcomed']);
});
