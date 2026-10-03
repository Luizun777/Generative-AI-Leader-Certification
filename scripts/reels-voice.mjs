import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { audioDir, readIndex, writeIndex } from './voice/audio-index.mjs';
import { FPS, VOICE_FRAME, VOICE_TAIL, narration, narrationHash, shown, voiceFits } from './voice/narration.mjs';

// Narra los reels con el servidor local text-2-voce y deja un MP3 por reel en public/reels-audio,
// más el índice que la app usa para colocar la voz de cada escena.
const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const tts = (process.env.TTS_URL ?? 'http://127.0.0.1:7860').replace(/\/$/, '');
const originals = process.env.REELS_VOICE_ORIGINALS ?? join(root, '..', '..', 'paper-assets', 'reels-voice');
// Opcional: un Python con faster-whisper puntúa cada toma contra su texto. Sin él solo se comprueba que quepa.
const whisperPython = process.env.WHISPER_PYTHON;
const RATE = 24000;
const PAD_IN = 0.06;
const PAD_OUT = 0.1;
const GAP = 0.25;
const MAX_REEL_BYTES = 260 * 1024;
// Una toma más lenta que esto alarga el reel sin necesidad: se repite, aunque se entienda bien.
const PACE_FLOOR = 11;
// Volumen eficaz al que se lleva cada toma, medido solo en sus tramos con voz.
const CLIP_RMS = 0.1;

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const values = name => args.flatMap((arg, index) => arg === name && args[index + 1] ? args[index + 1].split(',') : []);
const dryRun = flag('--dry-run');
const force = flag('--force');
const fit = flag('--fit');
// --retake repite las tomas guardadas que no llegan a la nota mínima; la guardada compite con las nuevas.
const retake = flag('--retake');
const only = values('--only');

function fail(message) { console.error(`FAIL voz: ${message}`); process.exit(1); }
const exists = path => access(path).then(() => true, () => false);
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const half = value => Math.ceil(value * 2 - 1e-9) / 2;

async function api(path, init) {
  let response;
  try { response = await fetch(tts + path, { ...init, signal: AbortSignal.timeout(180_000) }); }
  catch { fail(`text-2-voce no responde en ${tts}. Arráncalo con «uv run python server.py» en su carpeta.`); }
  if (!response.ok) fail(`text-2-voce respondió ${response.status} en ${path}: ${(await response.text()).slice(0, 300)}`);
  return response;
}

// El servidor guarda cada generación en su historial: se descarga y se borra, para no desplazar las del usuario.
async function synthesize(text, voice, target) {
  const entry = await (await api('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: voice.id, instruct: voice.instruct, speed: voice.speed, format: 'wav' }) })).json();
  const raw = `${target}.raw.wav`;
  await writeFile(raw, Buffer.from(await (await api(entry.url)).arrayBuffer()));
  await api(`/api/history/${entry.id}`, { method: 'DELETE' });
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', target]);
  await rm(raw, { force: true });
  return (await pcm(target)).length / 2 / RATE;
}

async function pcm(path) {
  const file = await readFile(path);
  const at = file.indexOf('data', 12, 'latin1');
  if (at < 0) fail(`${path} no es un WAV legible`);
  return file.subarray(at + 8, at + 8 + file.readUInt32LE(at + 4));
}
function wav(samples) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1'); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVEfmt ', 8, 'latin1');
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36, 'latin1'); header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}
const silence = seconds => Buffer.alloc(Math.round(seconds * RATE) * 2);
// El tempo se aplica al montar, sobre la toma ya guardada: ajustar el ritmo no obliga a narrar de nuevo.
async function clip(base, tempo) {
  if (Math.abs(tempo - 1) < 0.001) return pcm(`${base}.wav`);
  const paced = join(tmpdir(), `pliegue-voz-${process.pid}-tempo.wav`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${base}.wav`, '-af', `atempo=${tempo}`, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', paced]);
  const samples = await pcm(paced);
  await rm(paced, { force: true });
  return samples;
}

// Cada toma sale del modelo con su propio volumen: se igualan antes de unirlas para que ninguna escena salte.
function level(samples) {
  const count = samples.length / 2;
  const frame = RATE / 50;
  let sum = 0, voiced = 0, peak = 0;
  for (let at = 0; at + frame <= count; at += frame) {
    let energy = 0;
    for (let i = at; i < at + frame; i++) { const value = samples.readInt16LE(i * 2) / 32768; energy += value * value; peak = Math.max(peak, Math.abs(value)); }
    if (energy / frame > 1e-4) { sum += energy; voiced += frame; }
  }
  if (!voiced) return samples;
  const gain = Math.min(CLIP_RMS / Math.sqrt(sum / voiced), 0.84 / peak);
  const leveled = Buffer.alloc(samples.length);
  for (let i = 0; i < count; i++) leveled.writeInt16LE(Math.round(samples.readInt16LE(i * 2) * gain), i * 2);
  return leveled;
}

function openTranscriber() {
  if (!whisperPython) return null;
  const child = spawn(whisperPython, [join(root, 'scripts', 'voice', 'transcribe.py')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = [];
  createInterface({ input: child.stdout }).on('line', line => waiting.shift()?.(JSON.parse(line)));
  const next = () => new Promise(resolve => waiting.push(resolve));
  const ready = next();
  return { ready, async transcribe(path, hint) { const answer = next(); child.stdin.write(`${JSON.stringify({ path, hint })}\n`); return (await answer).text ?? ''; }, close() { child.stdin.end(); } };
}
const SMALL = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
// El transcriptor escribe «24» donde la voz dice «veinticuatro»: las cifras se comparan deletreadas.
const spell = digits => Number(digits) < 30 ? SMALL[Number(digits)] : Number(digits) < 100 ? TENS[Math.floor(Number(digits) / 10)] + (Number(digits) % 10 ? `y${SMALL[Number(digits) % 10]}` : '') : digits;
const flat = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\d+/g, spell).replace(/[^a-z0-9]/g, '');
// Parecido entre lo pedido y lo transcrito, sin espacios ni acentos: tolera «chat bot» y detecta una toma ininteligible.
function similarity(expected, heard) {
  const a = flat(expected), b = flat(heard);
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length, 1);
}
// Nombres propios y siglas de un reel: orientan al transcriptor sin darle la frase que debe comprobar.
const names = reel => [...new Set(reel.scenes.flatMap(scene => narration(scene).match(/(?<=[\p{L}\p{N},;:] )\p{Lu}[\p{L}\p{N}]+|\p{Lu}{2,}/gu) ?? []))];

const data = await json(join(root, 'src', 'data', 'reels.json'));
const lexicon = await json(join(root, 'scripts', 'voice', 'lexicon.json'));
const voice = await json(join(root, 'scripts', 'voice', 'voice.json'));
const tempo = voice.tempo ?? 1;
const selected = data.reels.filter(reel => !only.length || only.some(filter => reel.unitId === filter || reel.unitId.startsWith(`${filter}.`)));
if (!selected.length) fail('ningún reel coincide con --only');

const plan = [];
for (const reel of selected) for (const [index, scene] of reel.scenes.entries()) {
  const text = narration(scene, lexicon);
  const hash = narrationHash(text, voice);
  const base = join(originals, reel.unitId, `${index + 1}-${hash}`);
  const cached = !force && await exists(`${base}.wav`) && await exists(`${base}.json`);
  // La voz dice «a pe i» y el transcriptor escribe «API»: la toma se compara con lo dicho y con lo escrito.
  plan.push({ reel, index, scene, text, written: narration(scene), hint: `Nombres: ${names(reel).join(', ')}.`, hash, base, cached, redo: cached && retake && (await json(`${base}.json`)).score < voice.minScore });
}
const pending = plan.filter(item => !item.cached || item.redo);
console.log(`${selected.length} reels · ${plan.length} escenas · ${pending.length} por narrar · voz ${voice.id} · originales en ${originals}`);
if (dryRun) { for (const item of pending) console.log(`  ${item.reel.unitId} escena ${item.index + 1}  ${item.text}`); process.exit(0); }

if (pending.length) {
  const health = await (await api('/health')).json();
  if (!health.loaded) fail('text-2-voce todavía no ha cargado el modelo');
  if (!(await (await api('/api/voices')).json()).some(item => item.id === voice.id)) fail(`text-2-voce no tiene la voz «${voice.id}»`);
}
const transcriber = pending.length ? openTranscriber() : null;
if (transcriber) await transcriber.ready;
const work = join(tmpdir(), `pliegue-voz-${process.pid}`);
await mkdir(work, { recursive: true });

for (const item of pending) {
  await mkdir(join(originals, item.reel.unitId), { recursive: true });
  let best = null;
  const consider = async (path, take) => {
    const duration = (await pcm(path)).length / 2 / RATE / tempo;
    const heard = transcriber ? await transcriber.transcribe(path, item.hint) : null;
    const score = heard === null ? 1 : Math.max(similarity(item.text, heard), similarity(item.written, heard));
    const fits = voiceFits(item.scene, PAD_IN + duration + PAD_OUT) || duration <= item.text.length / PACE_FLOOR;
    const rank = (score >= voice.minScore ? 2 : 0) + (fits ? 1 : 0) + score;
    if (!best || rank > best.rank) best = { path, duration, heard, score, fits, rank, take };
    return score >= voice.minScore && fits;
  };
  let done = item.redo && await consider(`${item.base}.wav`, 0);
  for (let take = 1; !done && take <= voice.takes; take++) {
    const path = join(work, `${item.reel.unitId}-${item.index + 1}-${take}.wav`);
    await synthesize(item.text, voice, path);
    done = await consider(path, take);
  }
  if (best.take) await writeFile(`${item.base}.wav`, await readFile(best.path));
  await writeFile(`${item.base}.json`, `${JSON.stringify({ text: item.text, voice: voice.id, duration: Number(best.duration.toFixed(3)), score: Number(best.score.toFixed(3)), heard: best.heard, takes: best.take }, null, 2)}\n`);
  console.log(`  ${item.reel.unitId} escena ${item.index + 1}: ${best.duration.toFixed(2)} s · ${best.take ? `toma ${best.take}` : 'toma guardada'} · parecido ${best.score.toFixed(2)}${best.fits ? '' : ' · no cabe'}`);
}
transcriber?.close();
await rm(work, { recursive: true, force: true });

// Montaje: un archivo por reel, con cada escena separada por silencio para que un pequeño desfase al decodificar no corte palabras.
await mkdir(audioDir, { recursive: true });
const index = await readIndex();
const tight = [];
const weak = [];
for (const reel of selected) {
  const parts = [];
  const scenes = [];
  let cursor = 0;
  for (const item of plan.filter(entry => entry.reel === reel)) {
    const samples = level(await clip(item.base, tempo));
    const meta = await json(`${item.base}.json`);
    const duration = PAD_IN + samples.length / 2 / RATE + PAD_OUT;
    parts.push(silence(PAD_IN), samples, silence(PAD_OUT), silence(GAP));
    scenes.push({ start: Number(cursor.toFixed(3)), duration: Number(duration.toFixed(3)), hash: item.hash });
    cursor += duration + GAP;
    const needed = half(Math.max(1.5 + shown(item.scene).join('').length / 15, VOICE_FRAME / FPS + duration + VOICE_TAIL));
    if (fit ? needed !== item.scene.seconds : !voiceFits(item.scene, duration)) tight.push({ unit: reel.unitId, scene: item.index, seconds: item.scene.seconds, needed });
    if (meta.score < voice.minScore) weak.push(`${reel.unitId} escena ${item.index + 1} (parecido ${meta.score}): «${meta.heard}»`);
  }
  const joined = join(tmpdir(), `pliegue-voz-${process.pid}-${reel.unitId}.wav`);
  await writeFile(joined, wav(Buffer.concat(parts)));
  // Volumen lineal hasta -17 LUFS sin pasar de -1,5 dB de pico: iguala los reels sin tocar la dinámica de la voz.
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', joined, '-af', 'loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
  const measured = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const gain = Math.min(-17 - Number(measured.input_i), -1.5 - Number(measured.input_tp));
  const output = join(audioDir, `${reel.unitId}.mp3`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', joined, '-af', `volume=${gain.toFixed(2)}dB`, '-ar', String(RATE), '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '7', '-map_metadata', '-1', output]);
  await rm(joined, { force: true });
  const { size } = await stat(output);
  if (size > MAX_REEL_BYTES) fail(`${reel.unitId}.mp3 pesa ${(size / 1024).toFixed(0)} KB (máximo ${MAX_REEL_BYTES / 1024})`);
  index.reels[reel.unitId] = { file: `${reel.unitId}.mp3`, bytes: size, scenes };
  console.log(`PASS ${reel.unitId}: ${scenes.length} escenas · ${cursor.toFixed(1)} s de voz · ${(size / 1024).toFixed(0)} KB`);
}
await writeIndex({ ...index, voice: voice.id });

// --fit ajusta los segundos de cada escena a su voz (nunca por debajo del tiempo de lectura) sin tocar el resto del archivo.
if (fit && tight.length) {
  const path = join(root, 'src', 'data', 'reels.json');
  const lines = (await readFile(path, 'utf8')).split('\n');
  for (const change of tight) {
    const reelAt = lines.findIndex(line => line.includes(`"unitId": "${change.unit}"`));
    const sceneAt = lines.findIndex((line, at) => at > reelAt && line.trimStart().startsWith('{ "kind"')) + change.scene;
    lines[sceneAt] = lines[sceneAt].replace(/"seconds": [0-9.]+/, `"seconds": ${change.needed}`);
  }
  await writeFile(path, lines.join('\n'));
  console.log(`Ajustadas ${tight.length} escenas en reels.json a la duración de su voz.`);
} else if (tight.length) {
  for (const change of tight) console.log(`AJUSTA ${change.unit} escena ${change.scene + 1}: dura ${change.seconds} s y la voz necesita ${change.needed} s`);
}
if (weak.length) { console.log(`REVISA de oído ${weak.length} escenas con transcripción dudosa:`); for (const line of weak) console.log(`  ${line}`); }
if (!fit && tight.length) process.exit(1);
