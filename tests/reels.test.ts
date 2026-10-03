import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reel } from '../src/lib/reels';
import { FPS, FRAME_MS, absoluteFrame, advanceClock, firstPendingLesson, locate, reelFrames, sceneCues, sceneFrames, sceneText, segmentFill, startPlayback, step } from '../src/lib/reels';

const reel: Reel = { unitId: '1.1', title: 'Prueba', scenes: [
  { kind: 'hook', seconds: 2, title: 'Título', line: 'Línea' },
  { kind: 'list', seconds: 3, title: 'Lista', points: ['Uno', 'Dos', 'Tres'] },
  { kind: 'cta', seconds: 1, line: 'Cierre' },
] };

test('seconds become whole frames at 12 fps', () => {
  assert.deepEqual(reel.scenes.map(sceneFrames), [24, 36, 12]);
  assert.equal(reelFrames(reel), 72);
  assert.equal(sceneFrames({ kind: 'cta', seconds: 0, line: '' }), 1);
});

test('the clock quantizes elapsed time and keeps the remainder', () => {
  assert.deepEqual(advanceClock(0, 40), { frames: 0, restMs: 40 });
  const tick = advanceClock(40, 50);
  assert.equal(tick.frames, 1);
  assert.ok(Math.abs(tick.restMs - (90 - FRAME_MS)) < 1e-6);
  assert.equal(advanceClock(0, FRAME_MS * 2).frames, 2);
});

test('a long gap between ticks is capped to one second of playback', () => {
  assert.equal(advanceClock(0, 60_000).frames, 12);
  assert.equal(advanceClock(0, 400).frames, 4);
  assert.deepEqual(advanceClock(10, -500), { frames: 0, restMs: 10 });
});

test('locate maps an absolute frame to its scene and clamps at the end', () => {
  assert.deepEqual(locate(reel, 0), { scene: 0, frame: 0 });
  assert.deepEqual(locate(reel, 23), { scene: 0, frame: 23 });
  assert.deepEqual(locate(reel, 24), { scene: 1, frame: 0 });
  assert.deepEqual(locate(reel, 71), { scene: 2, frame: 11 });
  assert.deepEqual(locate(reel, 500), { scene: 2, frame: 12 });
  assert.deepEqual(locate(reel, -4), { scene: 0, frame: 0 });
});

test('ticks cross scene borders carrying the overflow and stop on the last scene', () => {
  let state = step(startPlayback(), reel, { type: 'tick', frames: 23 });
  assert.deepEqual(state, { scene: 0, frame: 23, playing: true, ended: false });
  state = step(state, reel, { type: 'tick', frames: 3 });
  assert.deepEqual(state, { scene: 1, frame: 2, playing: true, ended: false });
  assert.equal(absoluteFrame(reel, state), 26);
  state = step(state, reel, { type: 'tick', frames: 200 });
  assert.deepEqual(state, { scene: 2, frame: 12, playing: false, ended: true });
  assert.equal(step(state, reel, { type: 'tick', frames: 5 }), state);
});

test('a paused reel ignores ticks and toggle resumes it', () => {
  const paused = step(step(startPlayback(), reel, { type: 'tick', frames: 5 }), reel, { type: 'pause' });
  assert.equal(step(paused, reel, { type: 'tick', frames: 9 }), paused);
  assert.equal(step(paused, reel, { type: 'pause' }), paused);
  assert.deepEqual(step(paused, reel, { type: 'toggle' }), { scene: 0, frame: 5, playing: true, ended: false });
});

test('next and prev move between scenes like stories', () => {
  const second = step(startPlayback(), reel, { type: 'next' });
  assert.deepEqual(second, { scene: 1, frame: 0, playing: true, ended: false });
  assert.deepEqual(step(second, reel, { type: 'prev' }), startPlayback());
  const late = step(second, reel, { type: 'tick', frames: FPS + 1 });
  assert.deepEqual(step(late, reel, { type: 'prev' }), second);
  assert.deepEqual(step(startPlayback(), reel, { type: 'prev' }), startPlayback());
  const end = step(step(second, reel, { type: 'next' }), reel, { type: 'next' });
  assert.deepEqual(end, { scene: 2, frame: 12, playing: false, ended: true });
  assert.deepEqual(step(end, reel, { type: 'prev' }), { scene: 2, frame: 0, playing: true, ended: false });
});

test('a finished reel restarts from play, toggle or restart; jumping scenes resumes a paused reel', () => {
  const end = step(startPlayback(), reel, { type: 'tick', frames: 999 });
  for (const type of ['play', 'toggle', 'restart'] as const) assert.deepEqual(step(end, reel, { type }), startPlayback());
  assert.deepEqual(step(startPlayback(false), reel, { type: 'next' }), { scene: 1, frame: 0, playing: true, ended: false });
  const paused = step(step(startPlayback(), reel, { type: 'tick', frames: 30 }), reel, { type: 'pause' });
  assert.deepEqual(step(paused, reel, { type: 'prev' }), startPlayback());
});

test('segment fill follows the current scene', () => {
  assert.deepEqual(segmentFill(reel, startPlayback()), [0, 0, 0]);
  assert.deepEqual(segmentFill(reel, { scene: 1, frame: 18, playing: true, ended: false }), [1, 0.5, 0]);
  assert.deepEqual(segmentFill(reel, step(startPlayback(), reel, { type: 'tick', frames: 999 })), [1, 1, 1]);
});

test('scene text lists every visible string and pending lesson falls back to the first', () => {
  assert.deepEqual(sceneText(reel.scenes[1]), ['Lista', 'Uno', 'Dos', 'Tres']);
  assert.deepEqual(sceneText({ kind: 'versus', seconds: 1, a: { term: 'A', line: 'a' }, b: { term: 'B', line: 'b' } }), ['A', 'a', 'B', 'b']);
  assert.equal(firstPendingLesson(['1.01', '1.02'], ['1.01']), '1.02');
  assert.equal(firstPendingLesson(['1.01', '1.02'], ['1.01', '1.02']), '1.01');
});

// These are the frames the templates used before they were shared with the sound: the animation must not move.
test('scene cues keep every cut-out on its original entry frame', () => {
  assert.deepEqual(sceneCues({ kind: 'hook', seconds: 5, title: 'Más que un chatbot', line: 'Línea' }), [4, 8, 11, 14, 17, 22, 28]);
  assert.deepEqual(sceneCues({ kind: 'concept', seconds: 5, art: '1.1-a', artAlt: 'Arte', lines: ['Una', 'Dos'] }), [1, 9, 16]);
  assert.deepEqual(sceneCues({ kind: 'versus', seconds: 5, a: { term: 'A', line: 'a' }, b: { term: 'B', line: 'b' } }), [1, 6, 16, 20]);
  assert.deepEqual(sceneCues(reel.scenes[1]), [1, 10, 24, 38]);
  assert.deepEqual(sceneCues({ kind: 'example', seconds: 5, art: '1.1-b', artAlt: 'Arte', lines: ['Una'] }), [1, 4, 12]);
  assert.deepEqual(sceneCues({ kind: 'example', seconds: 5, lines: ['Una'] }), [1, 12]);
  assert.deepEqual(sceneCues({ kind: 'cta', seconds: 5, line: 'Cierre' }), [1, 8, 16]);
});

test('a long hook title pushes its strip and fox back instead of overlapping the last word', () => {
  const cues = sceneCues({ kind: 'hook', seconds: 5, title: 'a b c d e f g', line: 'Línea' });
  assert.deepEqual(cues.slice(-3), [26, 29, 35]);
});
