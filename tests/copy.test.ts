import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Copy } from '../src/lib/copy';
import { COPY } from '../src/lib/copy';

// Every text a voice can produce, so both voices are compared on the same situations.
const samples: Partial<Record<keyof Copy, unknown[][]>> = {
  newSessionBody: [[2, 5], [0, 1]], lessonStart: [[5], [1]], lessonStartButton: [[5], [1]],
  sessionLabel: [['lesson', '1.01'], ['quick'], ['exam']], questionEyebrow: [[1, 5]], questionTitle: [[1, 5, false], [2, 5, true]], selectionHelp: [[false], [true]],
  feedbackEyebrow: [[true], [false]], feedbackTitle: [[true], [false]], feedbackDetail: [[true, ['C']], [false, ['C']], [false, ['B', 'D']], [false, ['A', 'B', 'C']]],
  nextQuestion: [[true], [false]], resultsTitle: [['lesson'], ['quick'], ['exam']], resultsSummary: [['lesson', 5, 5], ['quick', 4, 5], ['quick', 5, 5], ['exam', 3, 5]],
  resultsNote: [['lesson', 8, 51], ['quick', 8, 51]], matchingSubtitle: [[5]], matchChosen: [['Crear']], matchRight: [[2, 4]], matchComplete: [[4]],
};
function texts(copy: Copy): string[] {
  return (Object.keys(copy) as (keyof Copy)[]).flatMap(key => {
    const value = copy[key] as unknown;
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value as string[];
    assert.ok(samples[key], `faltan ejemplos para ${key}`);
    return samples[key]!.map(args => (value as (...input: unknown[]) => string)(...args));
  });
}

test('both voices cover exactly the same texts, with the same shape', () => {
  assert.deepEqual(Object.keys(COPY.plain).sort(), Object.keys(COPY.warm).sort());
  for (const key of Object.keys(COPY.warm) as (keyof Copy)[]) assert.equal(typeof COPY.plain[key], typeof COPY.warm[key], key);
  assert.ok(texts(COPY.warm).every(text => typeof text === 'string') && texts(COPY.plain).every(text => typeof text === 'string'));
});

test('the plain voice stays literal: no exclamations, no shouting capitals, no figures of speech', () => {
  for (const text of texts(COPY.plain)) {
    assert.ok(!/[¡!]/.test(text), text);
    assert.ok(!/\p{Lu}{4,}/u.test(text), text);
    assert.ok(!/pliegue|encaj|vuelta|toma forma/i.test(text), text);
  }
});

test('the plain voice names the right answers in a full sentence', () => {
  assert.equal(COPY.plain.feedbackTitle(true), 'Correcto.');
  assert.equal(COPY.plain.feedbackDetail(false, ['C']), 'La respuesta correcta es la C.');
  assert.equal(COPY.plain.feedbackDetail(false, ['B', 'D']), 'Las respuestas correctas son la B y la D.');
  assert.equal(COPY.plain.feedbackDetail(false, ['A', 'B', 'C']), 'Las respuestas correctas son la A, la B y la C.');
  assert.equal(COPY.plain.lessonStartButton(5), 'Empezar las 5 preguntas');
  assert.equal(COPY.plain.lessonStartButton(1), 'Empezar la pregunta');
  assert.equal(COPY.plain.resultsSummary('quick', 4, 5), 'Tienes 1 pregunta para repasar.');
});

// The focus mode is described by what it does. Nothing shipped or kept in the repository names an audience.
test('no file names who a mode is for', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const reserved = new RegExp([['aut', 'is'], ['td', 'ah'], ['ad', 'hd'], ['neuro', 'diverg'], ['asper', 'ger'], ['hiper', 'activ'], ['ficit de aten', 'ci']].map(parts => parts.join('')).join('|'), 'i');
  const walk = (path: string): string[] => statSync(path).isDirectory() ? readdirSync(path).flatMap(name => walk(join(path, name))) : [path];
  const files = [...['src', 'scripts', 'tests'].flatMap(folder => walk(join(root, folder))), ...['index.html', 'AGENTS.md', 'HANDOFF.md', 'README.md'].map(name => join(root, name))]
    .filter(path => /\.(ts|tsx|css|json|mjs|py|html|md)$/.test(path) && !path.endsWith(join('data', 'curriculum.json')));
  assert.ok(files.length > 40);
  for (const path of files) assert.ok(!reserved.test(readFileSync(path, 'utf8')), path.slice(root.length));
});
