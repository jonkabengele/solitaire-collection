/**
 * Generates procedural SFX as 16-bit PCM WAVs into public/assets/sfx/.
 * Deterministic output, no external assets, no licensing concerns
 * (Freesound needs OAuth for downloads — synthesis is equivalent-or-
 * better for this use case and ships offline by construction).
 *
 *   node scripts/generate-sfx.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/assets/sfx');
mkdirSync(OUT, { recursive: true });

const SR = 44100;

/** Write a mono 16-bit PCM WAV from float samples in [-1, 1]. */
function wav(path, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

const sec = (s) => Math.round(s * SR);
const noise = () => Math.random() * 2 - 1;

/** Exponential decay envelope. */
const env = (t, dur, a = 0.005) => (t < a ? t / a : Math.exp(-(t - a) / dur));

/** Soft placement thud: low sine + short filtered noise click. */
function place() {
  const dur = 0.09;
  const n = sec(dur);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = env(t, 0.045);
    lp += 0.25 * (noise() - lp); // ~lowpass
    out[i] = e * (0.55 * Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.03) + 0.4 * lp);
  }
  return out;
}

/** Paper flip swish: noise swept through a rising band emphasis. */
function flip() {
  const dur = 0.13;
  const n = sec(dur);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const k = 0.06 + 0.5 * (t / dur); // opens the filter as it swishes
    lp += k * (noise() - lp);
    out[i] = env(t, 0.05, 0.02) * lp * 0.8;
  }
  return out;
}

/** Draw: single soft tick. */
function draw() {
  const dur = 0.06;
  const n = sec(dur);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    lp += 0.4 * (noise() - lp);
    out[i] = env(t, 0.02, 0.003) * lp * 0.7;
  }
  return out;
}

/** Riffle shuffle: four quick filtered noise ticks. */
function shuffle() {
  const dur = 0.28;
  const n = sec(dur);
  const out = new Float32Array(n);
  const ticks = [0, 0.07, 0.14, 0.2];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const start of ticks) {
      const u = t - start;
      if (u >= 0 && u < 0.05) v += env(u, 0.018, 0.002) * noise() * 0.5;
    }
    out[i] = v;
  }
  return out;
}

/** Invalid: short low square-ish buzz. */
function invalid() {
  const dur = 0.1;
  const n = sec(dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const s = Math.sign(Math.sin(2 * Math.PI * 110 * t)) * 0.35;
    out[i] = env(t, 0.05, 0.004) * s;
  }
  return out;
}

/** Win: bright three-note chime arpeggio (E5 G5 C6) with soft tails. */
function win() {
  const notes = [659.25, 783.99, 1046.5];
  const dur = 0.9;
  const n = sec(dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    notes.forEach((f, k) => {
      const u = t - k * 0.14;
      if (u >= 0) {
        const e = Math.exp(-u / 0.35) * Math.min(1, u / 0.01);
        v += 0.3 * e * (Math.sin(2 * Math.PI * f * u) + 0.3 * Math.sin(4 * Math.PI * f * u));
      }
    });
    out[i] = v;
  }
  return out;
}

const files = { place, flip, draw, shuffle, invalid, win };
for (const [name, fn] of Object.entries(files)) {
  wav(join(OUT, `${name}.wav`), fn());
}
console.log(`wrote ${Object.keys(files).length} sfx → ${OUT}`);
