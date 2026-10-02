import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// --partial: admite reels aún sin escribir y arte aún sin generar (piloto y producción por lotes).
const partial = process.argv.includes('--partial');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const data = await json('src/data/reels.json');
const curriculum = await json('src/data/curriculum.json');
const manifest = await json('scripts/comfy/art-manifest.json');
const MAX_IMAGE = 120 * 1024;
const MAX_TOTAL = 3 * 1024 * 1024;
const LIMITS = { line: 38, hookTitle: 24, hookWord: 12, listTitle: 26, point: 34, term: 18, versusLine: 34 };
const accents = new Set(['blue', 'orange', 'yellow']);
const middle = new Set(['concept', 'list', 'versus', 'example']);

const text = (value, max, label) => { assert.equal(typeof value, 'string', label); assert.ok(value.trim() === value && value.length > 0 && value.length <= max, `${label}: «${value}» (${value.length}/${max})`); return value; };
const lines = (value, label) => { assert.ok(Array.isArray(value) && value.length >= 1 && value.length <= 2, `${label}: 1 o 2 líneas`); return value.map((line, index) => text(line, LIMITS.line, `${label}[${index}]`)); };

assert.equal(data.version, 1);
assert.equal(data.fps, 12);
const units = new Map(curriculum.units.map(unit => [unit.id, unit]));
assert.equal(new Set(data.reels.map(reel => reel.unitId)).size, data.reels.length, 'Un reel por unidad');
if (!partial) assert.deepEqual(data.reels.map(reel => reel.unitId), curriculum.units.map(unit => unit.id), 'Los 17 reels, en el orden de las unidades');

const usedArt = new Set();
for (const reel of data.reels) {
  const at = `Reel ${reel.unitId}`;
  assert.ok(units.has(reel.unitId), `${at}: unidad inexistente`);
  text(reel.title, LIMITS.hookTitle, `${at} título`);
  assert.ok(reel.scenes.length >= 5 && reel.scenes.length <= 7, `${at}: entre 5 y 7 escenas`);
  assert.equal(reel.scenes[0].kind, 'hook', `${at}: empieza con hook`);
  assert.equal(reel.scenes.at(-1).kind, 'cta', `${at}: termina con cta`);
  assert.ok(reel.scenes.slice(1, -1).every(scene => middle.has(scene.kind)), `${at}: escenas intermedias válidas`);
  for (const [index, scene] of reel.scenes.entries()) {
    const label = `${at} escena ${index + 1} (${scene.kind})`;
    assert.ok(scene.accent === undefined || accents.has(scene.accent), `${label}: acento`);
    let shown = [];
    if (scene.kind === 'hook') {
      shown = [text(scene.title, LIMITS.hookTitle, `${label} título`), text(scene.line, LIMITS.line, `${label} línea`)];
      assert.ok(scene.title.split(' ').every(word => word.length <= LIMITS.hookWord), `${label}: palabras de ${LIMITS.hookWord} letras como máximo`);
    } else if (scene.kind === 'concept' || scene.kind === 'example') {
      shown = lines(scene.lines, `${label} líneas`);
      assert.ok(scene.kind === 'example' || scene.art, `${label}: necesita arte`);
      if (scene.art) { usedArt.add(scene.art); assert.ok(typeof scene.artAlt === 'string' && scene.artAlt.length >= 20, `${label}: artAlt descriptivo`); }
    } else if (scene.kind === 'list') {
      assert.equal(scene.points?.length, 3, `${label}: 3 puntos`);
      shown = [text(scene.title, LIMITS.listTitle, `${label} título`), ...scene.points.map((point, item) => text(point, LIMITS.point, `${label} punto ${item + 1}`))];
    } else if (scene.kind === 'versus') {
      shown = [scene.a, scene.b].flatMap((side, item) => [text(side?.term, LIMITS.term, `${label} término ${item + 1}`), text(side?.line, LIMITS.versusLine, `${label} línea ${item + 1}`)]);
    } else shown = [text(scene.line, LIMITS.line, `${label} línea`)];
    const characters = shown.join('').length;
    assert.ok(scene.seconds >= 1.5 + characters / 15, `${label}: ${scene.seconds} s no alcanzan para leer ${characters} caracteres (mínimo ${(1.5 + characters / 15).toFixed(1)} s)`);
  }
  const seconds = reel.scenes.reduce((total, scene) => total + scene.seconds, 0);
  assert.ok(seconds >= 30 && seconds <= 45, `${at}: dura ${seconds} s (30-45)`);
}

const planned = new Set(manifest.images.map(image => image.id));
for (const id of usedArt) {
  assert.ok(planned.has(id), `Arte ${id}: falta en art-manifest.json`);
  assert.ok(units.has(id.split('-')[0]), `Arte ${id}: el prefijo debe ser una unidad`);
}
if (!partial) assert.deepEqual([...planned].sort(), [...usedArt].sort(), 'art-manifest.json y los reels citan el mismo arte');
const files = (await readdir(resolve(root, 'public/reels')).catch(() => [])).filter(name => !name.startsWith('.'));
let total = 0;
for (const name of files) {
  assert.ok(name.endsWith('.avif') && usedArt.has(name.slice(0, -5)), `public/reels/${name}: archivo sin escena que lo use`);
  const { size } = await stat(resolve(root, 'public/reels', name));
  assert.ok(size <= MAX_IMAGE, `public/reels/${name}: ${(size / 1024).toFixed(0)} KB (máximo ${MAX_IMAGE / 1024})`);
  total += size;
}
assert.ok(total <= MAX_TOTAL, `Arte total ${(total / 2 ** 20).toFixed(2)} MB (máximo 3)`);
const missing = [...usedArt].filter(id => !files.includes(`${id}.avif`));
if (!partial) assert.deepEqual(missing, [], 'Arte sin generar');
console.log(`PASS reels: ${data.reels.length}/${curriculum.units.length} reels · ${files.length}/${usedArt.size} ilustraciones · ${(total / 1024).toFixed(0)} KB${missing.length ? ` · pendientes: ${missing.join(', ')}` : ''}`);
