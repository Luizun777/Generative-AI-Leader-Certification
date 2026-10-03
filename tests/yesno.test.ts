import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Curriculum, Question } from '../src/types';
import { buildRound, eligibleYesNo, judge } from '../src/lib/yesno';

const curriculum = JSON.parse(readFileSync(new URL('../src/data/curriculum.json', import.meta.url), 'utf8')) as Curriculum;
const question = (id: string, overrides: Partial<Question> = {}): Question => ({
  id, unitId: 'u1', lessonIds: ['l1'], kind: 'single', prompt: `¿Qué hace ${id}?`,
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }],
  correctIds: ['a'], explanation: 'Por qué', exam: false, sourceLabel: 'Material', ...overrides,
});
// Deterministic generator, so a failing round can be reproduced.
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('only questions whose options stand alone can be asked as yes or no', () => {
  const kept = eligibleYesNo([
    question('ok'), question('exam', { exam: true }), question('multiple', { kind: 'multiple', correctIds: ['a', 'b'] }),
    question('two', { options: [{ id: 'a', text: 'Verdadero' }, { id: 'b', text: 'Falso' }] }),
    question('table', { prompt: '| Caso | Uso |\n|---|---|\n| 1 | Crear |\n\n¿Qué uso es?' }), question('cells', { options: [{ id: 'a', text: '1 | 2' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] }),
    question('letter', { explanation: 'La opción A invierte los papeles.' }), question('best', { prompt: 'Un equipo duda. ¿Qué opción se adapta mejor?' }),
    question('scenario', { prompt: 'Busca el modelo más adecuado para su caso. ¿Qué técnica describe la lección?' }),
  ]);
  assert.deepEqual(kept.map(item => item.id), ['ok', 'scenario']);
});

test('the real bank keeps most practice questions and never an exam one', () => {
  const kept = eligibleYesNo(curriculum.questions);
  // 229 practice questions minus the true-or-false ones, the tables, the multiple-choice and the «best fit» stems.
  assert.equal(kept.length, 200);
  assert.ok(kept.every(item => !item.exam && item.kind === 'single' && item.options.length >= 3));
  assert.ok(new Set(kept.map(item => item.unitId)).size >= 17);
});

test('a round proposes right and wrong answers in equal parts, and a wrong one is never the correct option', () => {
  const bank = Array.from({ length: 30 }, (_, index) => question(`q${index}`));
  for (let seed = 1; seed <= 200; seed++) {
    const size = seed % 2 ? 10 : 5;
    const round = buildRound(bank, size, seeded(seed));
    assert.equal(round.length, size);
    assert.equal(new Set(round.map(item => item.questionId)).size, size);
    const right = round.filter(item => item.truth).length;
    assert.ok(right >= Math.floor(size / 2) && right <= Math.ceil(size / 2), `semilla ${seed}: ${right} de ${size}`);
    for (const item of round) assert.equal(item.optionId === 'a', item.truth);
  }
  assert.equal(buildRound(bank.slice(0, 3), 10, seeded(7)).length, 3);
  assert.deepEqual(buildRound([], 10, seeded(7)), []);
});

test('the reply is judged against whether the proposed answer was right', () => {
  assert.equal(judge({ questionId: 'q', optionId: 'a', truth: true }, true), true);
  assert.equal(judge({ questionId: 'q', optionId: 'a', truth: true }, false), false);
  assert.equal(judge({ questionId: 'q', optionId: 'b', truth: false }, false), true);
  assert.equal(judge({ questionId: 'q', optionId: 'b', truth: false }, true), false);
});
