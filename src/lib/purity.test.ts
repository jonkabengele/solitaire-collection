import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Architectural guards from spec §9 — enforced in CI, not just by review:
 *  - no Phaser or Svelte imports inside engine/ or variants/
 *  - no Math.random() anywhere except rng.ts
 */
const LIB = dirname(fileURLToPath(import.meta.url));

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectTs(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const engineFiles = collectTs(join(LIB, 'engine'));
const variantFiles = collectTs(join(LIB, 'variants'));
const gameFiles = [...engineFiles, ...variantFiles];

describe('engine purity (spec §9)', () => {
  it('has no Phaser or Svelte imports in engine/ or variants/', () => {
    for (const f of gameFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"]phaser/);
      expect(src, f).not.toMatch(/from\s+['"]svelte/);
    }
  });

  it('has no Math.random outside rng.ts', () => {
    for (const f of gameFiles) {
      if (f.endsWith('rng.ts')) continue;
      expect(readFileSync(f, 'utf8'), f).not.toContain('Math.random');
    }
  });
});
