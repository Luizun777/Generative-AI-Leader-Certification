import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { GlossaryCard } from '../src/lib/cards';
import type { Curriculum } from '../src/types';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));
const curriculum = read('curriculum.json') as Curriculum;
const cards = read('glossary.json').cards as GlossaryCard[];

test('the deck has one card per defined term, in course order, each tied to real lessons', () => {
  assert.equal(cards.length, 138);
  assert.equal(new Set(cards.map(card => card.id)).size, cards.length);
  const lessons = new Set(curriculum.lessons.map(lesson => lesson.id));
  for (const card of cards) {
    assert.match(card.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, card.id);
    assert.ok(card.lessons.length >= 1 && card.lessons.every(id => lessons.has(id)), card.id);
    assert.ok(card.term.length > 1 && card.english.length > 1 && card.definition.length >= 30 && card.definition.length <= 300, card.id);
    assert.ok(card.variant === undefined || card.variant.length > 1, card.id);
    assert.ok(Number.isInteger(card.line) && card.line > 0, card.id);
  }
  assert.deepEqual(cards.map(card => card.lessons[0]), cards.map(card => card.lessons[0]).sort());
});

test('no card is a note about the exam guide, points to a section the app lacks or carries markup', () => {
  for (const card of cards) {
    assert.doesNotMatch(card.definition, /^Guía oficial:/, card.id);
    assert.doesNotMatch(card.definition, /Ver "Lo que la guía pide/, card.id);
    assert.doesNotMatch(`${card.term} ${card.english} ${card.definition}`, /\*\*|[|<>`]/, card.id);
  }
});
