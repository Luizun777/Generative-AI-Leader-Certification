import assert from 'node:assert/strict';
import test from 'node:test';
import type { GlossaryCard } from '../src/lib/cards';
import { answerRound, createCardsStore, currentCard, deckCounts, emptyCards, gradeCard, isRepeat, pickRound, roundPosition, sanitizeCards, startRound } from '../src/lib/cards';

const card = (id: string): GlossaryCard => ({ id, term: id, english: id, definition: `Definición de ${id}.`, lessons: ['1.01'], line: 1 });
const deck = ['a', 'b', 'c', 'd', 'e', 'f'].map(card);

test('sanitize never throws: unreadable data becomes an empty state and bad marks are dropped alone', () => {
  for (const raw of [undefined, null, 'text', 7, [], true]) assert.deepEqual(sanitizeCards(raw), emptyCards());
  assert.deepEqual(sanitizeCards({ v: 9, turn: 4, extra: 1, cards: { a: { box: 2, seen: 3 }, b: { box: 4, seen: 1 }, c: { box: 1, seen: -1 }, d: 'x', e: { box: 1.5, seen: 2 }, f: null } }),
    { v: 1, turn: 4, cards: { a: { box: 2, seen: 3 } } });
  // The counter never falls behind the newest mark, so new answers stay newest.
  assert.equal(sanitizeCards({ turn: 1, cards: { a: { box: 1, seen: 9 } } }).turn, 9);
  assert.equal(sanitizeCards({ turn: 'x', cards: [] }).turn, 0);
});

test('a known card climbs one box up to the top; a missed card goes back to the first', () => {
  let state = emptyCards();
  for (const expected of [1, 2, 3, 3]) { state = gradeCard(state, 'a', true); assert.equal(state.cards.a.box, expected); }
  assert.deepEqual(state.cards.a, { box: 3, seen: 4 });
  state = gradeCard(state, 'a', false);
  assert.deepEqual([state.turn, state.cards.a], [5, { box: 0, seen: 5 }]);
  assert.deepEqual(gradeCard(emptyCards(), 'b', false).cards.b, { box: 0, seen: 1 });
});

test('a round starts with the missed cards, then the unseen in deck order, then the known that are due soonest', () => {
  assert.deepEqual(pickRound(deck, emptyCards(), 4), ['a', 'b', 'c', 'd']);
  let state = emptyCards();
  state = gradeCard(state, 'a', true);
  state = gradeCard(state, 'b', false);
  state = gradeCard(state, 'c', true);
  state = gradeCard(state, 'd', false);
  assert.deepEqual(pickRound(deck, state, 6), ['b', 'd', 'e', 'f', 'a', 'c']);
  assert.deepEqual(pickRound(deck, state, 3), ['b', 'd', 'e']);
  // A card known twice waits longer than one known once, even if it was answered earlier.
  state = gradeCard(gradeCard(state, 'e', true), 'e', true);
  state = gradeCard(state, 'f', true);
  assert.deepEqual(pickRound(deck, state, 6).slice(2), ['a', 'c', 'f', 'e']);
  assert.deepEqual(deckCounts(deck, state), { total: 6, known: 4, missed: 2 });
  assert.deepEqual(pickRound(deck, { v: 1, turn: 3, cards: { gone: { box: 0, seen: 3 } } }, 2), ['a', 'b']);
});

test('a missed card comes back three cards later, twice at most, without moving the position count', () => {
  let round = startRound(['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual([currentCard(round), roundPosition(round), isRepeat(round)], ['a', 1, false]);
  round = answerRound(round, false);
  assert.deepEqual(round.queue, ['a', 'b', 'c', 'd', 'a', 'e']);
  round = answerRound(answerRound(answerRound(round, true), true), true);
  assert.deepEqual([currentCard(round), roundPosition(round), isRepeat(round)], ['a', 4, true]);
  round = answerRound(round, false);
  assert.deepEqual(round.queue, ['a', 'b', 'c', 'd', 'a', 'e', 'a']);
  assert.deepEqual([currentCard(round), roundPosition(round), isRepeat(round)], ['e', 5, false]);
  round = answerRound(answerRound(round, true), false);
  assert.deepEqual([currentCard(round), round.queue.length, round.total, round.missed], [undefined, 7, 5, ['a']]);
  assert.equal(answerRound(round, true), round);
});

test('the store uses its own key, tolerates corrupt data and round-trips the marks', async () => {
  const saved = new Map<string, string>([['pliegue-ia.cards.v1', '{broken'], ['pliegue-ia.progress.v1', 'intacto']]);
  const store = createCardsStore({ get: async ({ key }) => ({ value: saved.get(key) ?? null }), set: async ({ key, value }) => { saved.set(key, value); } });
  assert.deepEqual(await store.load(), emptyCards());
  const state = gradeCard(emptyCards(), 'a', true);
  assert.equal(await store.save(state), true);
  assert.deepEqual(await store.load(), state);
  assert.equal(saved.get('pliegue-ia.progress.v1'), 'intacto');
});
