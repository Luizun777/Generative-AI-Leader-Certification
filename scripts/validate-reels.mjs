import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FPS, VOICE_FRAME, VOICE_TAIL, narration, narrationHash } from './voice/narration.mjs';

// --partial: admite reels aún sin escribir y arte aún sin generar (piloto y producción por lotes).
const partial = process.argv.includes('--partial');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
// --reels y --manifest validan un borrador en otra ruta antes de pasarlo a los archivos del proyecto.
const option = (name, fallback) => { const at = process.argv.indexOf(name); return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback; };
const data = await json(option('--reels', 'src/data/reels.json'));
const curriculum = await json('src/data/curriculum.json');
const manifest = await json(option('--manifest', 'scripts/comfy/art-manifest.json'));
const audio = await json('src/data/reels-audio.json');
const lexicon = await json('scripts/voice/lexicon.json');
const voice = await json('scripts/voice/voice.json');
const MAX_IMAGE = 120 * 1024;
const MAX_TOTAL = 3 * 1024 * 1024;
const MAX_REEL_AUDIO = 260 * 1024;
const MAX_AUDIO = 13 * 1024 * 1024;
const LIMITS = { line: 38, hookTitle: 24, hookWord: 12, listTitle: 26, point: 34, term: 18, versusLine: 34 };
// Ritmo de narración conservador (caracteres hablados por segundo) para las escenas que aún no tienen voz generada.
const SPEECH = { cps: 11, lead: 0.33, tail: 0.4, gap: 0.3 };
const accents = new Set(['blue', 'orange', 'yellow']);
const middle = new Set(['concept', 'list', 'versus', 'example']);

const text = (value, max, label) => { assert.equal(typeof value, 'string', label); assert.ok(value.trim() === value && value.length > 0 && value.length <= max, `${label}: «${value}» (${value.length}/${max})`); return value; };
const lines = (value, label) => { assert.ok(Array.isArray(value) && value.length >= 1 && value.length <= 2, `${label}: 1 o 2 líneas`); return value.map((line, index) => text(line, LIMITS.line, `${label}[${index}]`)); };

assert.equal(data.version, 1);
assert.equal(data.fps, 12);
const units = new Map(curriculum.units.map(unit => [unit.id, unit]));
const lessons = new Map(curriculum.lessons.map(lesson => [lesson.id, lesson]));
const words = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) ?? [];
const runs = value => { const list = words(value); return list.slice(0, Math.max(0, list.length - 4)).map((_, index) => list.slice(index, index + 5).join(' ')); };
// Cada unidad tiene su reel y cada lección el suyo. La lección única de una unidad comparte el de la unidad.
const key = reel => reel.lessonId ?? reel.unitId;
const unitReels = data.reels.filter(reel => !reel.lessonId);
const lessonReels = data.reels.filter(reel => reel.lessonId);
const ownReel = curriculum.units.filter(unit => unit.lessonIds.length > 1).flatMap(unit => unit.lessonIds);
assert.equal(new Set(data.reels.map(key)).size, data.reels.length, 'Un reel por unidad y uno por lección');
assert.equal(new Set(data.reels.map(reel => reel.title)).size, data.reels.length, 'Dos reels comparten título');
assert.deepEqual(data.reels.map(key), [...unitReels, ...lessonReels].map(key), 'Primero los reels de unidad, después los de lección');
assert.deepEqual(unitReels.map(key), partial ? unitReels.map(key).filter(id => units.has(id)) : curriculum.units.map(unit => unit.id), 'Los reels de unidad, en el orden de las unidades');
assert.deepEqual(lessonReels.map(key), partial ? ownReel.filter(id => lessonReels.some(reel => reel.lessonId === id)) : ownReel, 'Los reels de lección, en el orden de las lecciones');

const usedArt = new Set();
for (const reel of data.reels) {
  const at = `Reel ${key(reel)}`;
  assert.ok(units.has(reel.unitId), `${at}: unidad inexistente`);
  if (reel.lessonId) assert.equal(lessons.get(reel.lessonId)?.unitId, reel.unitId, `${at}: la lección no es de la unidad ${reel.unitId}`);
  text(reel.title, LIMITS.hookTitle, `${at} título`);
  assert.ok(reel.scenes.length >= 5 && reel.scenes.length <= 7, `${at}: entre 5 y 7 escenas`);
  assert.equal(reel.scenes[0].kind, 'hook', `${at}: empieza con hook`);
  assert.equal(reel.scenes.at(-1).kind, 'cta', `${at}: termina con cta`);
  assert.ok(reel.scenes.slice(1, -1).every(scene => middle.has(scene.kind)), `${at}: escenas intermedias válidas`);
  const source = new Set(units.get(reel.unitId).lessonIds.flatMap(id => { const lesson = lessons.get(id); return [lesson.idea, ...lesson.keyPoints, lesson.example, lesson.distinctions].flatMap(runs); }));
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
      if (scene.art) { assert.equal(scene.art.split('-')[0], key(reel), `${label}: el arte ${scene.art} debe llamarse ${key(reel)}-…`); usedArt.add(scene.art); assert.ok(typeof scene.artAlt === 'string' && scene.artAlt.length >= 20, `${label}: artAlt descriptivo`); }
    } else if (scene.kind === 'list') {
      assert.equal(scene.points?.length, 3, `${label}: 3 puntos`);
      shown = [text(scene.title, LIMITS.listTitle, `${label} título`), ...scene.points.map((point, item) => text(point, LIMITS.point, `${label} punto ${item + 1}`))];
    } else if (scene.kind === 'versus') {
      shown = [scene.a, scene.b].flatMap((side, item) => [text(side?.term, LIMITS.term, `${label} término ${item + 1}`), text(side?.line, LIMITS.versusLine, `${label} línea ${item + 1}`)]);
    } else shown = [text(scene.line, LIMITS.line, `${label} línea`)];
    const characters = shown.join('').length;
    assert.ok(scene.seconds >= 1.5 + characters / 15, `${label}: ${scene.seconds} s no alcanzan para leer ${characters} caracteres (mínimo ${(1.5 + characters / 15).toFixed(1)} s)`);
    const clip = audio.reels[key(reel)]?.scenes[index];
    if (clip) {
      // Con la voz ya generada manda su duración real, y lo narrado debe seguir siendo el texto de la escena.
      assert.equal(clip.hash, narrationHash(narration(scene, lexicon), voice), `${label}: la narración está desactualizada; vuelve a generar la voz`);
      const needed = VOICE_FRAME / FPS + clip.duration + VOICE_TAIL;
      assert.ok(scene.seconds >= needed - 1e-9, `${label}: ${scene.seconds} s no alcanzan para su voz de ${clip.duration} s (mínimo ${Math.ceil(needed * 2 - 1e-9) / 2} s)`);
    } else {
      const segments = scene.kind === 'hook' || scene.kind === 'versus' ? 2 : scene.kind === 'list' ? 4 : 1;
      const spoken = shown.join(' ').length;
      const estimate = SPEECH.lead + SPEECH.tail + SPEECH.gap * (segments - 1) + spoken / SPEECH.cps;
      assert.ok(scene.seconds >= estimate - 1e-9, `${label}: ${scene.seconds} s no alcanzan para narrar ${spoken} caracteres (mínimo ${Math.ceil(estimate * 2 - 1e-9) / 2} s)`);
    }
    if (scene.from !== undefined) assert.ok(Array.isArray(scene.from) && scene.from.length > 0 && scene.from.every(id => reel.lessonId ? id === reel.lessonId : lessons.get(id)?.unitId === reel.unitId), `${label}: «from» debe citar ${reel.lessonId ? `la lección ${reel.lessonId}` : `lecciones de la unidad ${reel.unitId}`}`);
    // Los guiones son adaptaciones: ninguna frase repite cinco palabras seguidas de las lecciones de su unidad.
    for (const phrase of scene.kind === 'concept' || scene.kind === 'example' ? [shown.join(' ')] : shown) {
      const copied = runs(phrase).find(run => source.has(run));
      assert.ok(!copied, `${label}: «${phrase}» repite «${copied}» de una lección`);
    }
  }
  const seconds = reel.scenes.reduce((total, scene) => total + scene.seconds, 0);
  assert.ok(seconds >= 30 && seconds <= 45, `${at}: dura ${seconds} s (30-45)`);
  const clips = audio.reels[key(reel)]?.scenes;
  if (!partial) assert.ok(clips, `${at}: falta la narración`);
  if (clips) {
    assert.equal(clips.length, reel.scenes.length, `${at}: una narración por escena`);
    // El silencio entre escenas evita que un pequeño desfase al decodificar corte una palabra.
    for (let index = 1; index < clips.length; index++) assert.ok(clips[index].start >= clips[index - 1].start + clips[index - 1].duration + 0.2 - 1e-9, `${at}: las narraciones ${index} y ${index + 1} se pisan`);
  }
}
for (const id of Object.keys(audio.reels)) assert.ok(data.reels.some(reel => key(reel) === id), `Narración de ${id}: no existe ese reel`);

const planned = new Set(manifest.images.map(image => image.id));
for (const id of usedArt) {
  assert.ok(planned.has(id), `Arte ${id}: falta en art-manifest.json`);
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

// El audio vive aparte del arte: un MP3 de voz por reel y una pista de música común.
const expected = new Map(Object.values(audio.reels).map(entry => [entry.file, entry.bytes]));
if (audio.music) expected.set(audio.music.file, audio.music.bytes);
if (!partial) assert.ok(audio.music, 'Falta la música de fondo');
const audioFiles = (await readdir(resolve(root, 'public/reels-audio')).catch(() => [])).filter(name => !name.startsWith('.'));
let audioTotal = 0;
for (const name of audioFiles) {
  assert.ok(expected.has(name), `public/reels-audio/${name}: archivo que ningún reel usa`);
  const { size } = await stat(resolve(root, 'public/reels-audio', name));
  assert.equal(size, expected.get(name), `public/reels-audio/${name}: no coincide con reels-audio.json; vuelve a generarlo`);
  assert.ok(name === audio.music?.file || size <= MAX_REEL_AUDIO, `public/reels-audio/${name}: ${(size / 1024).toFixed(0)} KB (máximo ${MAX_REEL_AUDIO / 1024})`);
  audioTotal += size;
}
for (const name of expected.keys()) assert.ok(audioFiles.includes(name), `Falta public/reels-audio/${name}`);
assert.ok(audioTotal <= MAX_AUDIO, `Audio total ${(audioTotal / 2 ** 20).toFixed(2)} MB (máximo ${MAX_AUDIO / 2 ** 20})`);
console.log(`PASS reels: ${unitReels.length}/${curriculum.units.length} de unidad · ${lessonReels.length}/${ownReel.length} de lección · ${files.length}/${usedArt.size} ilustraciones · ${(total / 1024).toFixed(0)} KB · ${Object.keys(audio.reels).length}/${data.reels.length} con voz · música ${audio.music ? 'sí' : 'no'} · audio ${(audioTotal / 1024).toFixed(0)} KB${missing.length ? ` · arte pendiente: ${missing.join(', ')}` : ''}`);
