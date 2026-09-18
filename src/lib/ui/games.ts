import type { VariantId } from '../engine/types.js';

/** Implemented variants — the source of truth for pickers (SideNav, race lobby). */
export const GAMES: { id: VariantId; icon: string; name: string; blurb: string }[] = [
  { id: 'klondike', icon: '♛', name: 'Klondike', blurb: 'The classic' },
  { id: 'freecell', icon: '♞', name: 'FreeCell', blurb: 'Pure skill' },
  { id: 'tripeaks', icon: '⛰', name: 'TriPeaks', blurb: 'Clear the peaks' },
  { id: 'pyramid', icon: '🔺', name: 'Pyramid', blurb: 'Pairs to thirteen' },
  { id: 'spider', icon: '🕷', name: 'Spider', blurb: 'Two decks, ten columns' }
];
