import { Preferences } from '@capacitor/preferences';
import { createJsonStore } from './json-store';
import type { KeyValueAdapter } from './json-store';

const CARDS_KEY = 'pliegue-ia.cards.v1';
export interface GlossaryCard { id: string; term: string; variant?: string; english: string; definition: string; lessons: string[]; line: number }
// box 0 = missed last time; 1 to 3 = known, each box waiting longer. `seen` is the turn of the last answer:
// an ordinal counter, so the order never depends on the device clock.
export interface CardMark { box: number; seen: number }
export interface CardsState { v: 1; turn: number; cards: Record<string, CardMark> }

const TOP_BOX = 3;
const WAIT = [0, 8, 24, 72];
export const emptyCards = (): CardsState => ({ v: 1, turn: 0, cards: {} });

export function sanitizeCards(raw: unknown): CardsState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyCards();
  const data = raw as Record<string, unknown>;
  const whole = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
  const cards: Record<string, CardMark> = {};
  if (data.cards && typeof data.cards === 'object' && !Array.isArray(data.cards)) for (const [id, mark] of Object.entries(data.cards)) {
    const { box, seen } = (mark ?? {}) as Record<string, unknown>;
    if (whole(box, TOP_BOX) && whole(seen, Number.MAX_SAFE_INTEGER)) cards[id] = { box, seen };
  }
  const latest = Math.max(0, ...Object.values(cards).map(mark => mark.seen));
  return { v: 1, turn: whole(data.turn, Number.MAX_SAFE_INTEGER) ? Math.max(data.turn, latest) : latest, cards };
}

export function gradeCard(state: CardsState, id: string, knew: boolean): CardsState {
  const turn = state.turn + 1;
  return { v: 1, turn, cards: { ...state.cards, [id]: { box: knew ? Math.min(TOP_BOX, (state.cards[id]?.box ?? 0) + 1) : 0, seen: turn } } };
}

// Next round: the cards missed last time, then the ones never seen (in course order), then the known ones that are due soonest.
export function pickRound(deck: readonly GlossaryCard[], state: CardsState, size: number): string[] {
  const mark = (card: GlossaryCard) => state.cards[card.id];
  const missed = deck.filter(card => mark(card)?.box === 0).sort((a, b) => mark(a).seen - mark(b).seen);
  const fresh = deck.filter(card => !mark(card));
  const due = (card: GlossaryCard) => mark(card).seen + WAIT[mark(card).box];
  const known = deck.filter(card => (mark(card)?.box ?? 0) > 0).sort((a, b) => due(a) - due(b));
  return [...missed, ...fresh, ...known].slice(0, size).map(card => card.id);
}

export function deckCounts(deck: readonly GlossaryCard[], state: CardsState) {
  const boxes = deck.map(card => state.cards[card.id]?.box);
  return { total: deck.length, known: boxes.filter(box => (box ?? 0) > 0).length, missed: boxes.filter(box => box === 0).length };
}

export interface CardRound { queue: string[]; at: number; total: number; repeats: Record<string, number>; missed: string[] }
const BACK = 3;
const MAX_REPEATS = 2;
export const startRound = (ids: readonly string[]): CardRound => ({ queue: [...ids], at: 0, total: ids.length, repeats: {}, missed: [] });
export const currentCard = (round: CardRound): string | undefined => round.queue[round.at];
export const isRepeat = (round: CardRound) => round.queue.indexOf(round.queue[round.at]) < round.at;
// «Tarjeta 3 de 10» counts each card once: a card that comes back does not move the count.
export const roundPosition = (round: CardRound) => new Set(round.queue.slice(0, round.at + 1)).size;
// A missed card comes back three cards later, twice at most.
export function answerRound(round: CardRound, knew: boolean): CardRound {
  const id = currentCard(round);
  if (id === undefined) return round;
  const queue = [...round.queue];
  const repeats = { ...round.repeats };
  if (!knew && (repeats[id] ?? 0) < MAX_REPEATS) { repeats[id] = (repeats[id] ?? 0) + 1; queue.splice(Math.min(queue.length, round.at + 1 + BACK), 0, id); }
  return { ...round, queue, repeats, at: round.at + 1, missed: knew || round.missed.includes(id) ? round.missed : [...round.missed, id] };
}

export const createCardsStore = (adapter: KeyValueAdapter) => createJsonStore(adapter, CARDS_KEY, sanitizeCards);
const store = createCardsStore(Preferences);
export const loadCards = store.load;
export const saveCards = store.save;
