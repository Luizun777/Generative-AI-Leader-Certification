import { execFile } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { audioDir, readIndex, writeIndex } from './voice/audio-index.mjs';

// Genera la música de fondo de los reels con ComfyUI local (ACE-Step v1, instrumental) y deja lista la pista elegida.
const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const comfy = (process.env.COMFY_URL ?? 'http://127.0.0.1:8188').replace(/\/$/, '');
const originals = process.env.REELS_MUSIC_ORIGINALS ?? join(root, '..', '..', 'paper-assets', 'reels-music');
const TRACK_SECONDS = 46;
const MAX_BYTES = 420 * 1024;
const TIMEOUT_MS = 40 * 60 * 1000;

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const values = name => args.flatMap((arg, index) => arg === name && args[index + 1] ? args[index + 1].split(',') : []);
const dryRun = flag('--dry-run');
const only = values('--only');
const force = new Set(values('--force'));
const useOverride = values('--use')[0];

function fail(message) { console.error(`FAIL música: ${message}`); process.exit(1); }
const exists = path => access(path).then(() => true, () => false);

async function api(path, init) {
  let response;
  try { response = await fetch(comfy + path, { ...init, signal: AbortSignal.timeout(30_000) }); }
  catch { fail(`ComfyUI no responde en ${comfy}. Abre Comfy Desktop y vuelve a intentarlo.`); }
  if (!response.ok) fail(`ComfyUI respondió ${response.status} en ${path}: ${(await response.text()).slice(0, 400)}`);
  return response;
}

async function checkModels(workflow) {
  for (const node of Object.values(workflow)) {
    const info = (await (await api(`/object_info/${node.class_type}`)).json())[node.class_type];
    if (!info) fail(`ComfyUI no tiene el nodo ${node.class_type}. Actualiza ComfyUI para usar ACE-Step.`);
    if (!/Loader/.test(node.class_type)) continue;
    for (const [input, value] of Object.entries(node.inputs)) {
      const spec = info.input.required?.[input];
      const options = Array.isArray(spec?.[0]) ? spec[0] : spec?.[1]?.options;
      if (Array.isArray(options) && !options.includes(value)) fail(`${node.class_type} no encuentra «${value}». Falta el archivo en ComfyUI-Shared/models/checkpoints.`);
    }
  }
}

// Todas las pistas se encolan juntas: así ComfyUI cambia de modelo una sola vez aunque esté generando arte.
async function queue(workflow, manifest, track) {
  const graph = structuredClone(workflow);
  const find = type => Object.entries(graph).find(([, node]) => node.class_type === type);
  const [, encoder] = find('TextEncodeAceStepAudio');
  const [, latent] = find('EmptyAceStepLatentAudio');
  const [, sampler] = find('KSampler');
  const [saveId, save] = find('SaveAudio');
  encoder.inputs.tags = track.tags;
  encoder.inputs.lyrics = manifest.lyrics;
  latent.inputs.seconds = manifest.seconds;
  sampler.inputs.seed = track.seed;
  save.inputs.filename_prefix = `pliegue-reels/${track.id}`;
  const queued = await (await api('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: 'pliegue-reels' }) })).json();
  if (!queued.prompt_id) fail(`ComfyUI rechazó ${track.id}: ${JSON.stringify(queued.node_errors ?? queued).slice(0, 600)}`);
  return { track, promptId: queued.prompt_id, saveId, started: Date.now() };
}

async function collect({ track, promptId, saveId, started }) {
  while (Date.now() - started < TIMEOUT_MS) {
    const entry = (await (await api(`/history/${promptId}`)).json())[promptId];
    if (entry?.status?.status_str === 'error') fail(`ComfyUI falló en ${track.id}: ${JSON.stringify(entry.status.messages?.at(-1) ?? entry.status).slice(0, 600)}`);
    const file = entry?.outputs?.[saveId]?.audio?.[0];
    if (file) {
      const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'output' });
      await writeFile(join(originals, `${track.id}.flac`), Buffer.from(await (await api(`/view?${query}`)).arrayBuffer()));
      return Math.round((Date.now() - started) / 1000);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  fail(`${track.id} superó ${TIMEOUT_MS / 60000} minutos sin terminar.`);
}

// Una pista corta sin bucle: cubre el reel más largo (45 s). Mono y a volumen de voz; la app la baja 20 dB.
async function publish(id) {
  const output = join(audioDir, 'music.mp3');
  await mkdir(audioDir, { recursive: true });
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(originals, `${id}.flac`), '-t', String(TRACK_SECONDS), '-af', `afade=t=in:d=0.6,afade=t=out:st=${TRACK_SECONDS - 2.5}:d=2.5,loudnorm=I=-17:TP=-1.5:LRA=11`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', output]);
  const { size } = await stat(output);
  if (size > MAX_BYTES) fail(`music.mp3 pesa ${(size / 1024).toFixed(0)} KB (máximo ${MAX_BYTES / 1024})`);
  const index = await readIndex();
  await writeIndex({ ...index, music: { file: 'music.mp3', seconds: TRACK_SECONDS, bytes: size } });
  return size;
}

const manifest = JSON.parse(await readFile(join(root, 'scripts', 'comfy', 'music-manifest.json'), 'utf8'));
const workflow = JSON.parse(await readFile(join(root, 'scripts', 'comfy', 'ace-step-v1-instrumental.api.json'), 'utf8'));
const ids = new Set(manifest.tracks.map(track => track.id));
if (ids.size !== manifest.tracks.length) fail('hay identificadores repetidos en music-manifest.json');
const use = useOverride ?? manifest.use;
if (!ids.has(use)) fail(`la pista elegida «${use}» no existe en music-manifest.json`);

const selected = manifest.tracks.filter(track => force.size ? force.has(track.id) : !only.length || only.includes(track.id));
const pending = [];
for (const track of selected) if (force.has(track.id) || !(await exists(join(originals, `${track.id}.flac`)))) pending.push(track);
console.log(`${selected.length} en selección · ${pending.length} pendientes · pista de la app: ${use} · originales en ${originals}`);
if (pending.length) {
  const stats = await (await api('/system_stats')).json();
  await checkModels(workflow);
  console.log(`PASS ComfyUI ${stats.system.comfyui_version} · ${(stats.system.ram_free / 2 ** 30).toFixed(1)} GB de RAM libres`);
}
if (dryRun) process.exit(0);

await mkdir(originals, { recursive: true });
const jobs = [];
for (const track of pending) jobs.push(await queue(workflow, manifest, track));
for (const job of jobs) console.log(`PASS ${job.track.id}: lista a los ${await collect(job)} s de encolarla`);
if (!(await exists(join(originals, `${use}.flac`)))) fail(`falta el original de «${use}»; genera esa pista primero`);
console.log(`PASS música: ${use} publicada como music.mp3 · ${((await publish(use)) / 1024).toFixed(0)} KB`);
