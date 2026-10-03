import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Curriculum, Lesson } from '../src/types';
import type { LessonOverrides } from '../src/lib/lesson-steps';
import { formatFragment, lessonSteps } from '../src/lib/lesson-steps';

const lesson = (overrides: Partial<Lesson> = {}): Lesson => ({ id: '9.01', unitId: '9.1', worldId: 9, title: 'Prueba', idea: 'Idea.', keyPoints: ['Uno.', 'Dos.', 'Tres.', 'Cuatro.'], example: 'Ejemplo.', distinctions: 'Primera.\n\nSegunda.', sourceUrl: '', ...overrides });
const curriculum = JSON.parse(readFileSync(new URL('../src/data/curriculum.json', import.meta.url), 'utf8')) as Curriculum;
const overrides = JSON.parse(readFileSync(new URL('../src/data/lesson-overrides.json', import.meta.url), 'utf8')) as LessonOverrides;

test('steps follow the lesson: idea, each key point, example and each distinction', () => {
  assert.deepEqual(lessonSteps(lesson()).map(step => `${step.kind} ${step.index}/${step.of} ${step.text}`),
    ['idea 1/1 Idea.', 'point 1/4 Uno.', 'point 2/4 Dos.', 'point 3/4 Tres.', 'point 4/4 Cuatro.', 'example 1/1 Ejemplo.', 'distinction 1/2 Primera.', 'distinction 2/2 Segunda.']);
});

test('a lesson without example or distinctions simply has fewer steps', () => {
  assert.deepEqual(lessonSteps(lesson({ example: '', distinctions: '' })).map(step => step.kind), ['idea', 'point', 'point', 'point', 'point']);
  assert.deepEqual(lessonSteps(lesson({ distinctions: 'Solo una.' })).at(-1), { kind: 'distinction', index: 1, of: 1, text: 'Solo una.' });
});

test('an override replaces only its fragment and only in its lesson', () => {
  const overrides = { '9.01': { point2: { text: 'Dos, reescrito.', source: 'TEMARIO.md:1' }, dist1: { text: 'Primera, clara.', source: 'TEMARIO.md:2' } }, '9.02': { idea: { text: 'Otra.', source: 'TEMARIO.md:3' } } };
  assert.deepEqual(lessonSteps(lesson(), overrides).map(step => step.text), ['Idea.', 'Uno.', 'Dos, reescrito.', 'Tres.', 'Cuatro.', 'Ejemplo.', 'Primera, clara.', 'Segunda.']);
});

test('every real lesson becomes five to eight steps without losing any text', () => {
  for (const item of curriculum.lessons) {
    const steps = lessonSteps(item);
    assert.ok(steps.length >= 5 && steps.length <= 8, `${item.id}: ${steps.length} pasos`);
    assert.ok(steps.every(step => step.text.trim().length > 0), item.id);
    assert.equal(steps.map(step => step.text).join('\n\n'), [item.idea, ...item.keyPoints, ...(item.example ? [item.example] : []), ...(item.distinctions ? [item.distinctions] : [])].join('\n\n'), item.id);
  }
});

test('a leading label becomes a subtitle and its parts a list; plain sentences stay whole', () => {
  assert.deepEqual(formatFragment('Crear: Generar código; Pruebas de unidades; código de partida'), { label: 'Crear', items: ['Generar código', 'Pruebas de unidades', 'código de partida'] });
  assert.deepEqual(formatFragment('2006: Google Traductor: traduce idiomas'), { label: '2006', items: ['Google Traductor: traduce idiomas'] });
  assert.deepEqual(formatFragment('Las personas predicen con experiencia; los modelos usan probabilidades.'), { items: ['Las personas predicen con experiencia; los modelos usan probabilidades.'] });
  assert.deepEqual(formatFragment('En el video, Brett "alucina": gatos que hablan.'), { items: ['En el video, Brett "alucina": gatos que hablan.'] });
  assert.deepEqual(formatFragment('La IA no es infalible.'), { items: ['La IA no es infalible.'] });
  assert.deepEqual(formatFragment('Dos motivos: ver cómo se integra; y que es útil.'), { label: 'Dos motivos', items: ['ver cómo se integra; y que es útil.'] });
});

test('every rewrite replaces a fragment that exists, cites its line and reads as a short paragraph', () => {
  const lessons = new Map(curriculum.lessons.map(item => [item.id, item]));
  for (const [id, fragments] of Object.entries(overrides)) {
    const item = lessons.get(id);
    assert.ok(item, `${id}: no es una lección`);
    const plain = lessonSteps(item), rewritten = lessonSteps(item, overrides);
    assert.equal(rewritten.length, plain.length, id);
    assert.equal(rewritten.filter((step, index) => step.text !== plain[index].text).length, Object.keys(fragments).length, `${id}: una reescritura no corresponde a ningún fragmento`);
    for (const [key, rewrite] of Object.entries(fragments)) {
      assert.match(rewrite.source, /^TEMARIO\.md:\d+$/, `${id} ${key}`);
      assert.ok(rewrite.text.length > 20 && rewrite.text.length <= 320, `${id} ${key}: ${rewrite.text.length} caracteres`);
      assert.doesNotMatch(rewrite.text, /; |[!¡*|\n]/, `${id} ${key}`);
      assert.equal(formatFragment(rewrite.text).items.length, 1, `${id} ${key}: se partiría en viñetas`);
    }
  }
});
