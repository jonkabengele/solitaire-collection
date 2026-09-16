import type { Card, GameState, Rank, Suit, Variant } from './types.js';
import { shuffle } from './rng.js';

const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_LETTER: Record<Suit, string> = {
  spades: 's',
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c'
};
const LETTER_SUIT: Record<string, Suit> = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs'
};

/**
 * Stable card id for `Move.cardId` — suit letter + rank number, e.g. `'s1'`, `'h13'`.
 */
export function cardId(suit: Suit, rank: Rank): string {
  return `${SUIT_LETTER[suit]}${rank}`;
}

/**
 * Build a fresh 52-card deck (all face-down), suits × ranks in fixed order.
 * Order before shuffling is canonical: spades 1–13, hearts, diamonds, clubs.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: cardId(suit, rank as Rank), suit, rank: rank as Rank, faceUp: false });
    }
  }
  return deck;
}

/**
 * Reconstruct a card from its id (face-down by default).
 * @param id e.g. `'s1'`, `'c12'`
 * @param faceUp initial face state
 */
export function cardFromId(id: string, faceUp = false): Card {
  const suit = LETTER_SUIT[id[0]];
  const rank = Number(id.slice(1)) as Rank;
  if (!suit || !(rank >= 1 && rank <= 13)) throw new Error(`bad card id: ${id}`);
  return { id, suit, rank, faceUp };
}

/**
 * Deterministically shuffled deck for `seed`. Same seed → same order.
 */
export function shuffledDeck(seed: string): Card[] {
  return shuffle(seed, createDeck());
}

/**
 * Deal a new game: delegate to the variant's own layout.
 * @param seed deal seed
 * @param variant variant implementation to deal with
 */
export function deal(seed: string, variant: Variant): GameState {
  return variant.initialState(seed);
}
