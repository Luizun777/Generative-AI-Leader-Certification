import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Índice que usa la app para colocar la voz de cada escena. Lo escriben reels-voice y reels-music.
const path = fileURLToPath(new URL('../../src/data/reels-audio.json', import.meta.url));
export const audioDir = fileURLToPath(new URL('../../public/reels-audio/', import.meta.url));

export async function readIndex() {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return { version: 1, voice: null, music: null, reels: {} }; }
}

// Un reel por línea, primero los de unidad («2.1») y después los de lección («2.10»): el archivo se revisa de un vistazo y los diffs son cortos.
const isLesson = key => /\.\d\d$/.test(key);
const inline = value => Array.isArray(value) ? `[${value.map(inline).join(', ')}]` : value && typeof value === 'object' ? `{ ${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }` : JSON.stringify(value);
export async function writeIndex(index) {
  const units = Object.keys(index.reels).sort((a, b) => isLesson(a) - isLesson(b) || Number(a) - Number(b));
  const reels = units.map(unit => `    ${JSON.stringify(unit)}: ${inline(index.reels[unit])}`).join(',\n');
  await writeFile(path, `{\n  "version": 1,\n  "voice": ${inline(index.voice)},\n  "music": ${inline(index.music)},\n  "reels": {${reels ? `\n${reels}\n  ` : ''}}\n}\n`);
}
