import assert from 'node:assert/strict';
import test from 'node:test';
import type { AudioPort, SoundLevel, Tone } from '../src/lib/sound';
import { MASTER_GAIN, SOUND_NAMES, createSoundPlayer, recipe, recipeSeconds } from '../src/lib/sound';

const peak = (list: readonly Tone[]) => Math.max(...list.map(tone => list.filter(other => other.at < tone.at + tone.dur && tone.at < other.at + other.dur).reduce((sum, other) => sum + other.gain, 0)));
function harness(state = 'running') {
  const scheduled: { freq: number; startAt: number; volume: number }[] = [];
  const clock = { ms: 0, opened: 0, resumed: 0, state, resumeTo: 'running' };
  const port: AudioPort = {
    currentTime: 2,
    get state() { return clock.state; },
    resume: async () => { clock.resumed++; clock.state = clock.resumeTo; },
    tone: (tone, startAt, volume) => { scheduled.push({ freq: tone.freq, startAt, volume }); },
  };
  const player = createSoundPlayer({ open: () => { clock.opened++; return port; }, now: () => clock.ms });
  return { player, scheduled, clock };
}

test('silence schedules nothing and never opens the audio context', () => {
  const { player, scheduled, clock } = harness();
  for (const name of SOUND_NAMES) { assert.deepEqual(recipe(name, 'off'), []); assert.equal(player.play(name), false); }
  assert.equal(clock.opened, 0);
  assert.equal(scheduled.length, 0);
});

test('every recipe stays gentle: soft waves, slow attack, short and bounded', () => {
  for (const level of ['soft', 'lively'] as const) for (const name of SOUND_NAMES) {
    const list = recipe(name, level);
    assert.ok(list.length > 0, `${level} ${name}`);
    for (const tone of list) {
      assert.ok(tone.wave === 'sine' || tone.wave === 'triangle', `${level} ${name}: onda`);
      assert.ok(tone.attack >= .008 && tone.attack < tone.dur, `${level} ${name}: ataque`);
      assert.ok(tone.freq >= 320 && tone.freq <= 1600 && (tone.to ?? tone.freq) <= 1600, `${level} ${name}: frecuencia`);
      assert.ok(tone.gain > 0 && tone.gain <= 1, `${level} ${name}: ganancia`);
    }
    const limit = name === 'complete' ? (level === 'soft' ? .4 : .9) : name === 'correct' ? (level === 'soft' ? .16 : .4) : level === 'soft' ? .15 : .2;
    assert.ok(recipeSeconds(list) <= limit + 1e-9, `${level} ${name}: dura ${recipeSeconds(list)} s`);
    assert.ok(peak(list) * MASTER_GAIN[level] < .5, `${level} ${name}: pico`);
  }
});

test('lively is louder than soft and the error never outweighs the success', () => {
  assert.ok(MASTER_GAIN.lively > MASTER_GAIN.soft);
  for (const level of ['soft', 'lively'] as const) {
    assert.ok(peak(recipe('incorrect', level)) < peak(recipe('correct', level)), level);
    assert.equal(recipe('incorrect', level).length, 1);
  }
  for (const name of SOUND_NAMES) assert.ok(peak(recipe(name, 'lively')) * MASTER_GAIN.lively > peak(recipe(name, 'soft')) * MASTER_GAIN.soft, name);
});

test('the context opens once, on the first sound, and tones follow the recipe at the level volume', () => {
  const { player, scheduled, clock } = harness();
  player.setLevel('soft');
  assert.equal(player.play('correct'), true);
  clock.ms = 500;
  assert.equal(player.play('step'), true);
  assert.equal(clock.opened, 1);
  assert.deepEqual(scheduled.slice(0, 2).map(item => item.freq), recipe('correct', 'soft').map(tone => tone.freq));
  assert.ok(Math.abs(scheduled[0].volume - MASTER_GAIN.soft * .8) < 1e-9);
  assert.ok(scheduled[1].startAt - scheduled[0].startAt - .08 < 1e-9 && scheduled[0].startAt > 2);
});

test('a meaningful sound silences the generic tap of the same gesture, and duplicate taps collapse', () => {
  const { player, scheduled, clock } = harness();
  player.setLevel('lively');
  player.play('correct');
  const afterCue = scheduled.length;
  clock.ms = 49;
  assert.equal(player.play('tap'), false);
  assert.equal(player.play('select'), false);
  assert.equal(scheduled.length, afterCue);
  clock.ms = 50;
  assert.equal(player.play('tap'), true);
  clock.ms = 80;
  assert.equal(player.play('select'), false);
  clock.ms = 90;
  assert.equal(player.play('select'), true);
  clock.ms = 95;
  assert.equal(player.play('incorrect'), true);
});

test('a suspended context resumes, but a late or failed start drops the sound', async () => {
  const quick = harness('suspended');
  quick.player.setLevel('soft');
  assert.equal(quick.player.play('tap'), true);
  assert.equal(quick.scheduled.length, 0);
  await Promise.resolve();
  assert.equal(quick.clock.resumed, 1);
  assert.equal(quick.scheduled.length, 1);

  const late = harness('suspended');
  late.player.setLevel('soft');
  late.player.play('tap');
  late.clock.ms = 151;
  await Promise.resolve();
  assert.equal(late.scheduled.length, 0);

  const blocked = harness('suspended');
  blocked.clock.resumeTo = 'suspended';
  blocked.player.setLevel('soft');
  blocked.player.play('tap');
  await Promise.resolve();
  assert.equal(blocked.scheduled.length, 0);
});

test('a browser without audio support stays silent without throwing', () => {
  let level: SoundLevel = 'soft';
  const player = createSoundPlayer({ open: () => null, now: () => 0 });
  player.setLevel(level);
  assert.equal(player.play('complete'), false);
  level = 'off';
  player.setLevel(level);
  assert.equal(player.play('complete'), false);
});
