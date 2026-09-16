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

function corner(rank, suit, x, y, rotate) {
  const { glyph, color } = SUITS[suit];
  const inner = `
    <text x="${x}" y="${y}" font-size="30" text-anchor="middle" fill="${color}">${rank}</text>
    <text x="${x}" y="${y + 28}" font-size="26" text-anchor="middle" fill="${color}">${glyph}</text>`;
  return rotate ? `<g transform="rotate(180 ${W / 2} ${H / 2})">${inner}</g>` : inner;
}

function face(suit, rank) {
  const { glyph, color } = SUITS[suit];
  const label = rankLabel(rank);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="#fdfdfb" stroke="#c4c7c0" stroke-width="2"/>
  <g font-family="Arial,Helvetica,sans-serif" font-weight="700">
    ${corner(label, suit, 22, 34, false)}
    ${corner(label, suit, 22, 34, true)}
    <text x="${W / 2}" y="${H / 2 + 30}" font-size="72" text-anchor="middle" fill="${color}">${glyph}</text>
  </g>
</svg>
`;
}

function back() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="#123f31" stroke="#0d2c22" stroke-width="2"/>
  <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="8" fill="none" stroke="#e8ebe6" stroke-width="2" opacity="0.75"/>
  <rect x="${W / 2 - 26}" y="${H / 2 - 26}" width="52" height="52" transform="rotate(45 ${W / 2} ${H / 2})" fill="none" stroke="#e8ebe6" stroke-width="2" opacity="0.75"/>
  <rect x="${W / 2 - 14}" y="${H / 2 - 14}" width="28" height="28" transform="rotate(45 ${W / 2} ${H / 2})" fill="#e8ebe6" opacity="0.75"/>
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
