import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/content/index.ts'],
  outfile: 'dist/content.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  charset: 'utf8',
});
copyFileSync('src/manifest.json', 'dist/manifest.json');
console.log('built dist/');
