import { execFile } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Genera el arte de los reels con ComfyUI local (Qwen-Image 2512) y lo deja listo en public/reels.
const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const comfy = (process.env.COMFY_URL ?? 'http://127.0.0.1:8188').replace(/\/$/, '');
const originals = process.env.REELS_ORIGINALS ?? join(root, '..', '..', 'paper-assets', 'reels');
const finals = join(root, 'public', 'reels');
const MAX_BYTES = 120 * 1024;
const TIMEOUT_MS = 40 * 60 * 1000;

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const values = name => args.flatMap((arg, index) => arg === name && args[index + 1] ? args[index + 1].split(',') : []);
const dryRun = flag('--dry-run');
const convertOnly = flag('--convert-only');
const only = values('--only');
const force = new Set(values('--force'));
const seedOverride = values('--seed')[0];

function fail(message) { console.error(`FAIL arte: ${message}`); process.exit(1); }
const exists = path => access(path).then(() => true, () => false);
const matches = (id, filter) => id === filter || id.startsWith(`${filter}-`) || id.startsWith(`${filter}.`);

async function api(path, init) {
  let response;
  try { response = await fetch(comfy + path, { ...init, signal: AbortSignal.timeout(30_000) }); }
  catch { fail(`ComfyUI no responde en ${comfy}. Abre Comfy Desktop y vuelve a intentarlo.`); }
  if (!response.ok) fail(`ComfyUI respondió ${response.status} en ${path}: ${(await response.text()).slice(0, 400)}`);
  return response;
}

async function checkModels(workflow) {
  const loaders = Object.values(workflow).filter(node => /Loader/.test(node.class_type));
  for (const node of loaders) {
    const info = (await (await api(`/object_info/${node.class_type}`)).json())[node.class_type];
    if (!info) fail(`ComfyUI no tiene el nodo ${node.class_type}. Instala ComfyUI-GGUF.`);
    for (const [input, value] of Object.entries(node.inputs)) {
      const spec = info.input.required?.[input];
      const options = Array.isArray(spec?.[0]) ? spec[0] : spec?.[1]?.options;
      if (Array.isArray(options) && !options.includes(value)) fail(`${node.class_type} no encuentra «${value}». Falta el archivo o su enlace en ComfyUI-Shared/models.`);
    }
  }
}

async function generate(workflow, manifest, image) {
  const graph = structuredClone(workflow);
  const sampler = Object.values(graph).find(node => node.class_type === 'KSampler');
  const save = Object.entries(graph).find(([, node]) => node.class_type === 'SaveImage');
  graph[sampler.inputs.positive[0]].inputs.text = manifest.style.replace('{SUBJECT}', image.subject);
  graph[sampler.inputs.negative[0]].inputs.text = manifest.negative;
  sampler.inputs.seed = seedOverride ? Number(seedOverride) : image.seed;
  save[1].inputs.filename_prefix = `pliegue-reels/${image.id}`;
  const queued = await (await api('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: 'pliegue-reels' }) })).json();
  if (!queued.prompt_id) fail(`ComfyUI rechazó ${image.id}: ${JSON.stringify(queued.node_errors ?? queued).slice(0, 600)}`);
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const entry = (await (await api(`/history/${queued.prompt_id}`)).json())[queued.prompt_id];
    if (!entry) continue;
    if (entry.status?.status_str === 'error') fail(`ComfyUI falló en ${image.id}: ${JSON.stringify(entry.status.messages?.at(-1) ?? entry.status).slice(0, 600)}`);
    const file = entry.outputs?.[save[0]]?.images?.[0];
    if (!file) continue;
    const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'output' });
    const png = Buffer.from(await (await api(`/view?${query}`)).arrayBuffer());
    await writeFile(join(originals, `${image.id}.png`), png);
    return Math.round((Date.now() - started) / 1000);
  }
  fail(`${image.id} superó ${TIMEOUT_MS / 60000} minutos sin terminar.`);
}

async function convert(id) {
  const output = join(finals, `${id}.avif`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(originals, `${id}.png`), '-vf', 'scale=720:960:flags=lanczos,format=yuv420p', '-frames:v', '1', '-c:v', 'libsvtav1', '-crf', '30', output]);
  const { size } = await stat(output);
  return size;
}

const manifest = JSON.parse(await readFile(join(root, 'scripts', 'comfy', 'art-manifest.json'), 'utf8'));
const workflow = JSON.parse(await readFile(join(root, 'scripts', 'comfy', 'qwen2512-t2i.api.json'), 'utf8'));
const ids = new Set(manifest.images.map(image => image.id));
if (ids.size !== manifest.images.length) fail('hay identificadores repetidos en art-manifest.json');
for (const id of force) if (!ids.has(id)) fail(`--force ${id}: no existe en art-manifest.json`);
if (seedOverride && force.size !== 1) fail('--seed solo se admite junto a un único --force <id>');

const selected = manifest.images.filter(image => force.size ? force.has(image.id) : !only.length || only.some(filter => matches(image.id, filter)));
const pending = [];
for (const image of selected) {
  const hasOriginal = await exists(join(originals, `${image.id}.png`));
  const hasFinal = await exists(join(finals, `${image.id}.avif`));
  if (force.has(image.id) || !hasOriginal) pending.push({ image, action: convertOnly ? 'falta original' : 'generar' });
  else if (!hasFinal || convertOnly) pending.push({ image, action: 'convertir' });
}
console.log(`${selected.length} en selección · ${pending.length} pendientes · originales en ${originals}`);
for (const { image, action } of pending) console.log(`  ${image.id}  ${action}  semilla ${seedOverride ?? image.seed}`);

const toGenerate = pending.filter(item => item.action === 'generar');
if (toGenerate.length) {
  const stats = await (await api('/system_stats')).json();
  await checkModels(workflow);
  console.log(`PASS ComfyUI ${stats.system.comfyui_version} · ${(stats.system.ram_free / 2 ** 30).toFixed(1)} GB de RAM libres`);
}
if (dryRun) process.exit(0);

await mkdir(originals, { recursive: true });
await mkdir(finals, { recursive: true });
let heavy = 0;
for (const { image, action } of pending) {
  if (action === 'falta original') { console.log(`SKIP ${image.id}: no hay original que convertir`); continue; }
  const seconds = action === 'generar' ? await generate(workflow, manifest, image) : null;
  const size = await convert(image.id);
  if (size > MAX_BYTES) heavy += 1;
  console.log(`${size > MAX_BYTES ? 'WARN' : 'PASS'} ${image.id}: ${seconds === null ? 'convertida' : `generada en ${seconds} s`} · ${(size / 1024).toFixed(0)} KB`);
}
if (heavy) fail(`${heavy} imagen(es) superan ${MAX_BYTES / 1024} KB`);
