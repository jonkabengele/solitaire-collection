// Generates card face/back SVGs into public/assets/cards/ — run: node scripts/generate-cards.mjs
// Minimal high-contrast design per final.md: white faces, bold rank corners,
// large centered suit glyph, red/black two-colour deck (4-colour toggle is Phase 4).

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'assets', 'cards');

const W = 140;
const H = 196;

const SUITS = {
  s: { glyph: '♠', color: '#1f2430' },
  h: { glyph: '♥', color: '#c02a33' },
  d: { glyph: '♦', color: '#c02a33' },
  c: { glyph: '♣', color: '#1f2430' }
};

const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rankLabel = (r) => RANK_LABEL[r] ?? String(r);

function corner(rank, suit, x, y) {
  const { glyph, color } = SUITS[suit];
  return `
    <text x="${x}" y="${y}" font-size="42" text-anchor="middle" fill="${color}">${rank}</text>
    <text x="${x}" y="${y + 34}" font-size="32" text-anchor="middle" fill="${color}">${glyph}</text>`;
}

function face(suit, rank) {
  const { glyph, color } = SUITS[suit];
  const label = rankLabel(rank);
  // Reference design: one top-left corner index + a giant centred suit
  // glyph. No rotated bottom corner — stacked cards only show the top.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="#fdfdfb" stroke="#c4c7c0" stroke-width="2"/>
  <g font-family="Arial,Helvetica,sans-serif" font-weight="700">
    ${corner(label, suit, 27, 44)}
    <text x="${W / 2}" y="${H / 2 + 44}" font-size="120" text-anchor="middle" fill="${color}">${glyph}</text>
  </g>
</svg>
`;
}

function back() {
  // Deep-blue casino back: vertical gradient field, woven lattice pattern
  // (a rotated grid = diamond crosshatch), white inset border, centre medallion.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bk-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f66cc"/>
      <stop offset="1" stop-color="#1a3f94"/>
    </linearGradient>
    <pattern id="bk-weave" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0 H16 M0 8 H16 M0 0 V16 M8 0 V16" stroke="#ffffff" stroke-opacity="0.09" stroke-width="3" fill="none"/>
    </pattern>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="url(#bk-bg)" stroke="#12306e" stroke-width="2"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="8" fill="url(#bk-weave)" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2"/>
  <g opacity="0.55" stroke="#ffffff" fill="none">
    <circle cx="${W / 2}" cy="${H / 2}" r="24" stroke-width="2"/>
    <rect x="${W / 2 - 11}" y="${H / 2 - 11}" width="22" height="22" transform="rotate(45 ${W / 2} ${H / 2})" stroke-width="2"/>
  </g>
</svg>
`;
}

mkdirSync(outDir, { recursive: true });

let count = 0;
for (const suit of Object.keys(SUITS)) {
  for (let rank = 1; rank <= 13; rank++) {
    writeFileSync(join(outDir, `${suit}${rank}.svg`), face(suit, rank));
    count++;
  }
}
writeFileSync(join(outDir, 'back.svg'), back());
rmSync(join(outDir, '.gitkeep'), { force: true });
console.log(`wrote ${count} faces + back → ${outDir}`);
