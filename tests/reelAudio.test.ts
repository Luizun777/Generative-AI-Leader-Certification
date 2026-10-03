import assert from 'node:assert/strict';
import test from 'node:test';
import type { Playback, PlaybackAction, Reel } from '../src/lib/reels';
import { startPlayback, step } from '../src/lib/reels';
import type { AudioCommand, ReelAudioInfo } from '../src/lib/reelAudio';
import { audioCommands, musicPosition, voiceFits } from '../src/lib/reelAudio';

const reel: Reel = { unitId: '1.1', title: 'Prueba', scenes: [
  { kind: 'hook', seconds: 4, title: 'Uno dos', line: 'Línea' },
  { kind: 'list', seconds: 6, title: 'Lista', points: ['Uno', 'Dos', 'Tres'] },
  { kind: 'cta', seconds: 3, line: 'Cierre' },
] };
const clips = [{ start: 0, duration: 3, hash: 'a' }, { start: 3.25, duration: 5, hash: 'b' }, { start: 8.5, duration: 2, hash: 'c' }];
const all: ReelAudioInfo = { clips, voice: true, effects: true, music: true, still: false };
const types = (commands: AudioCommand[]) => commands.map(command => command.type);
// Runs real reducer transitions and collects what the audio would do at each one.
function run(info: ReelAudioInfo, actions: PlaybackAction[], from: Playback = startPlayback()) {
  let state = from;
  return actions.map(action => { const next = step(state, reel, action); const commands = audioCommands(reel, state, next, action.type, info); state = next; return commands; });
}
const tick = (frames: number): PlaybackAction => ({ type: 'tick', frames });

test('the start only brings the music; the voice waits for its frame and then follows the picture', () => {
  assert.deepEqual(audioCommands(reel, startPlayback(), startPlayback(), 'start', all), [{ type: 'music', position: 0 }]);
  const [early, entry, later] = run(all, [tick(3), tick(1), tick(1)]);
  assert.deepEqual(early, []);
  assert.deepEqual(entry, [{ type: 'voice', offset: 0, duration: 3 }]);
  assert.deepEqual(later, []);
  const [late] = run(all, [tick(10)]);
  assert.deepEqual(late.find(command => command.type === 'voice'), { type: 'voice', offset: .5, duration: 2.5 });
});

test('a cut-out lands once per tick, four frames after it enters, and only with effects on', () => {
  // hook cues: label 4, words 8 and 11, strip 22, fox 28 -> they land on 8, 12, 15, 26 and 32
  const frames = run(all, Array.from({ length: 40 }, () => tick(1))).map(types);
  assert.deepEqual(frames.flatMap((list, index) => list.includes('land') ? [index + 1] : []), [8, 12, 15, 26, 32]);
  assert.deepEqual(types(run(all, [tick(7), tick(9)])[1]), ['land']);
  assert.ok(run({ ...all, effects: false }, Array.from({ length: 40 }, () => tick(1))).every(list => !types(list).includes('land') && !types(list).includes('chime')));
});

test('a scene reached by the clock chimes and speaks; the music just keeps going', () => {
  const [, crossing, voice] = run(all, [tick(47), tick(2), tick(4)]);
  assert.deepEqual(types(crossing), ['chime']);
  assert.deepEqual(voice.filter(command => command.type === 'voice'), [{ type: 'voice', offset: 3.25 + 1 / 12, duration: 5 - 1 / 12 }]);
  assert.ok(![crossing, voice].flat().some(command => command.type === 'music' || command.type === 'stopMusic'));
});

test('pause stops voice and music; resume places both from the frame on screen', () => {
  const [, pause, resume] = run(all, [tick(16), { type: 'pause' }, { type: 'play' }]);
  assert.deepEqual(pause, [{ type: 'stopVoice' }, { type: 'stopMusic', fade: .05 }]);
  assert.deepEqual(resume, [{ type: 'music', position: 16 / 12 }, { type: 'voice', offset: 1, duration: 2 }]);
  const [, , early] = run(all, [tick(2), { type: 'toggle' }, { type: 'toggle' }]);
  assert.deepEqual(early, [{ type: 'music', position: 2 / 12 }]);
  assert.deepEqual(run(all, [{ type: 'pause' }], startPlayback(false))[0], []);
});

test('jumps restart the scene: voice off, chime, music moved; prev on the same scene included', () => {
  const [, next, , back] = run(all, [tick(20), { type: 'next' }, tick(30), { type: 'prev' }]);
  assert.deepEqual(next, [{ type: 'stopVoice' }, { type: 'chime' }, { type: 'music', position: 4 }]);
  assert.deepEqual(back, [{ type: 'stopVoice' }, { type: 'chime' }, { type: 'music', position: 4 }]);
  assert.deepEqual(run({ ...all, music: false, effects: false }, [{ type: 'next' }])[0], [{ type: 'stopVoice' }]);
});

test('the end fades the music out, and replaying from the end starts over', () => {
  const [, , end, again] = run(all, [{ type: 'next' }, { type: 'next' }, tick(40), { type: 'toggle' }]);
  assert.deepEqual(end, [{ type: 'stopMusic', fade: .8 }]);
  assert.deepEqual(again, [{ type: 'stopVoice' }, { type: 'music', position: 0 }]);
  const [, , finish] = run(all, [{ type: 'next' }, { type: 'next' }, { type: 'next' }]);
  assert.deepEqual(finish, [{ type: 'stopVoice' }, { type: 'stopMusic', fade: .8 }]);
});

test('still mode speaks each scene in full when it is entered, with no music or effects', () => {
  const still: ReelAudioInfo = { ...all, still: true };
  const paused = startPlayback(false);
  assert.deepEqual(audioCommands(reel, paused, paused, 'start', still), [{ type: 'voice', offset: 0, duration: 3 }]);
  const [next, hidden, back, end] = run(still, [{ type: 'next' }, { type: 'pause' }, { type: 'prev' }, tick(3)], paused);
  assert.deepEqual(next, [{ type: 'voice', offset: 3.25, duration: 5 }]);
  assert.deepEqual(hidden, [{ type: 'stopVoice' }]);
  assert.deepEqual(back, [{ type: 'voice', offset: 0, duration: 3 }]);
  assert.deepEqual(end, []);
  assert.deepEqual(run({ ...still, voice: false }, [{ type: 'next' }], paused)[0], [{ type: 'stopVoice' }]);
});

test('without a clip, or with the voice off, the scene stays silent', () => {
  assert.ok(!run({ ...all, voice: false }, [tick(10)]).flat().some(command => command.type === 'voice'));
  assert.ok(!run({ ...all, clips: [] }, [tick(10)]).flat().some(command => command.type === 'voice'));
});

test('a clip fits when it ends before its scene, and the music follows the absolute frame', () => {
  assert.equal(voiceFits(reel.scenes[0], { start: 0, duration: 3.2, hash: '' }), true);
  assert.equal(voiceFits(reel.scenes[0], { start: 0, duration: 3.3, hash: '' }), false);
  assert.equal(musicPosition(reel, { scene: 1, frame: 6, playing: true, ended: false }), 4.5);
});
