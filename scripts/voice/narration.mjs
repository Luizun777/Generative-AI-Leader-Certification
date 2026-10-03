import { createHash } from 'node:crypto';

// Lo que se narra es el texto que se ve en pantalla, que así sirve de subtítulo. `say` lo sustituye
// en una escena y el léxico corrige cómo se pronuncian siglas y nombres.
export const FPS = 12;
export const VOICE_FRAME = 4;
export const VOICE_TAIL = 0.4;

const close = text => /[.!?…]$/.test(text) ? text : `${text}.`;
const literal = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Tras «Por un lado, término:» la frase sigue en minúscula, salvo que empiece por una sigla o un nombre propio.
const lower = text => /^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text;

export function narration(scene, lexicon = {}) {
  // La comparación arranca en español: una frase que empieza por un nombre en inglés arrastra la voz a ese acento.
  const parts = scene.say ? [scene.say]
    : scene.kind === 'hook' ? [close(scene.title), close(scene.line)]
    : scene.kind === 'concept' || scene.kind === 'example' ? [close(scene.lines.join(' '))]
    : scene.kind === 'list' ? [close(scene.title), ...scene.points.map(close)]
    : scene.kind === 'versus' ? [close(`Por un lado, ${scene.a.term}: ${lower(scene.a.line)}`), close(`Por otro, ${scene.b.term}: ${lower(scene.b.line)}`)]
    : [close(scene.line)];
  let text = parts.join(' ');
  for (const [written, spoken] of Object.entries(lexicon)) text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${literal(written)}(?![\\p{L}\\p{N}])`, 'gu'), spoken);
  return text;
}

// Los textos que se ven en la escena, en el orden en que aparecen.
export const shown = scene => scene.kind === 'hook' ? [scene.title, scene.line] : scene.kind === 'concept' || scene.kind === 'example' ? scene.lines
  : scene.kind === 'list' ? [scene.title, ...scene.points] : scene.kind === 'versus' ? [scene.a.term, scene.a.line, scene.b.term, scene.b.line] : [scene.line];

// Cambia cuando cambia algo que altera el audio: el texto dicho o la voz que lo dice.
export const narrationHash = (text, voice) => createHash('sha256').update([voice.id, voice.preset ?? '', voice.instruct ?? '', voice.speed ?? 1, text].join('|')).digest('hex').slice(0, 12);
export const voiceFits = (scene, duration) => VOICE_FRAME / FPS + duration + VOICE_TAIL <= scene.seconds + 1e-9;
