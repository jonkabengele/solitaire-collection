/**
 * Build the Nakama module: esbuild bundle (engine + match logic, exposed
 * as `RaceEngine`) + the ES5 glue appended at top level of the SAME file.
 * Nakama evals each module file in isolation, so the glue must live in the
 * bundle file itself — its AST scan needs InitModule + handlers as
 * top-level function declarations there.
 */
import { buildSync } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('server/build', { recursive: true });
buildSync({
  entryPoints: ['server/core.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'RaceEngine',
  outfile: 'server/build/_bundle.js',
  logLevel: 'warning'
});

const bundle = readFileSync('server/build/_bundle.js', 'utf8');
const entry = readFileSync('server/entry.js', 'utf8');
writeFileSync('server/build/index.js', `${bundle}\n${entry}`);
console.log('server/build/index.js written');
