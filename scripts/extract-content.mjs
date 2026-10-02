import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The only authored source is the local course outline. No network/API is used.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(resolve(root, '../TEMARIO.md'), 'utf8');
const lines = source.split('\n');
const headings = [...source.matchAll(/^(#{2,4}) (.+)$/gm)].map(m => ({
  depth: m[1].length, title: m[2], start: m.index, end: m.index + m[0].length,
}));
const worldTitles = ['Negocio y estrategia', 'Fundamentos', 'Elige tu herramienta', 'Prompts que funcionan', 'Agentes en acción'];
const descriptions = [
  'Descubre cómo la IA generativa aporta valor y cómo incorporarla a una organización.',
  'Conecta datos, aprendizaje, modelos de base y prácticas de IA segura y responsable.',
  'Explora las capas de la IA y elige soluciones según las necesidades del negocio.',
  'Mejora tus instrucciones y usa las herramientas de productividad de Google.',
  'Comprende modelos, herramientas y agentes que ayudan a transformar una organización.',
];

const plain = text => text
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();

// Select whole sentences/clauses, never slice Markdown or leave an ellipsis.
function brief(text, limit = 340, maxSentences = 1) {
  const clean = plain(text).replace(/^(?:[-*]|\d+\.)\s+/, '');
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u);
  const selected = [];
  for (const sentence of sentences) {
    if (selected.length >= maxSentences || (selected.length && [...selected, sentence].join(' ').length > limit)) break;
    selected.push(sentence);
  }
  let result = selected.join(' ');
  if (result.length > limit && result.includes('; ')) {
    const firstClause = result.split('; ')[0];
    if (firstClause.length > 40 && firstClause.length <= limit) result = firstClause + '.';
  }
  return result;
}

function section(body, label) {
  const marker = `**${label}**`;
  const start = body.indexOf(marker);
  if (start < 0) return '';
  const rest = body.slice(start + marker.length).trim();
  const next = rest.search(/^\*\*[^*\n]+\*\*/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

function candidates(text) {
  const result = [];
  for (const block of text.split(/\n\s*\n/)) {
    if (block.startsWith('|')) {
      const rows = block.split('\n').filter(row => row.startsWith('|'));
      for (const row of rows.slice(2)) {
        const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
        if (cells.length > 1) result.push(`${cells[0]}: ${cells.slice(1).filter(c => c !== '—' && c !== '-').join('; ')}`);
      }
    } else {
      for (const item of block.split(/\n(?=\s*(?:- |\d+\. ))/)) {
        const clean = item.trim().replace(/^(?:- |\d+\. )/, '').trim();
        if (clean && !clean.endsWith(':')) result.push(clean);
      }
    }
  }
  return result;
}

function pointsFor(body) {
  const points = candidates(section(body, 'Puntos clave'))
    .filter(p => !/^(?:Cursos de la ruta|Cinco cursos|Presentan el curso|Conviene ingresar|Este curso es)/.test(p))
    .map(p => brief(p));
  const unique = [...new Set(points)].filter(Boolean);
  if (unique.length <= 4) return unique;
  // Spread the four cards through the source rather than dropping its later topics.
  return [unique[0], unique[1], unique[Math.floor(unique.length / 2)], unique.at(-1)];
}

const worlds = worldTitles.map((title, i) => ({ id: i + 1, title, shortTitle: title, description: descriptions[i] }));
const units = [];
const lessons = [];
let activeUnit;
for (let i = 0; i < headings.length; i++) {
  const heading = headings[i];
  const unit = heading.title.match(/^Módulo ([1-5]\.\d)\. (.+)$/);
  if (unit) {
    activeUnit = { id: unit[1], worldId: Number(unit[1][0]), title: unit[2], lessonIds: [] };
    units.push(activeUnit);
  }
  const lesson = heading.title.match(/^Lección ([1-5]\.\d{2})\. (.+)$/);
  if (!lesson) continue;
  if (!activeUnit) throw new Error(`Lesson ${lesson[1]} has no unit`);
  const body = source.slice(heading.end, headings[i + 1]?.start ?? source.length);
  const idea = body.match(/\*\*Idea central\.\*\* ([\s\S]*?)(?=\n\n|$)/)?.[1];
  const url = body.match(/\[actividad en Google Skills\]\((https:[^)]+)\)/)?.[1];
  if (!idea || !url) throw new Error(`Missing idea/source for ${lesson[1]}`);
  const examples = candidates(section(body, 'Ejemplos y casos del curso'));
  const distinctions = candidates(section(body, 'No confundir'));
  lessons.push({
    id: lesson[1], unitId: activeUnit.id, worldId: activeUnit.worldId, title: lesson[2],
    idea: brief(idea, 520, 2), keyPoints: pointsFor(body),
    example: examples.length ? brief(examples[0], 420, 2) : '',
    distinctions: distinctions.slice(0, 2).map(p => brief(p, 300)).join('\n\n'), sourceUrl: url,
  });
  activeUnit.lessonIds.push(lesson[1]);
}

const lessonMap = new Map(lessons.map(lesson => [lesson.id, lesson]));
const examStart = source.indexOf('\n## Simulacro final\n');
const appendixStart = source.indexOf('\n## Apéndice:');
const questions = [];
for (const match of source.slice(0, appendixStart).matchAll(/^\*\*(\d+)\.\*\* ([\s\S]*?)<details><summary>Ver respuesta<\/summary>\s*([\s\S]*?)<\/details>/gm)) {
  const number = Number(match[1]);
  const exam = match.index > examStart;
  const before = headings.filter(h => h.start < match.index);
  const assessment = [...before].reverse().find(h => /^(Autoevaluación del módulo |Simulacro final|Práctica de los temas)/.test(h.title));
  const unitId = assessment?.title.match(/^Autoevaluación del módulo (\d\.\d)/)?.[1] ?? null;
  const content = match[2].trim();
  const optionStart = content.search(/^- [A-E]\) /m);
  if (optionStart < 0) throw new Error(`Missing options at source offset ${match.index}`);
  const prompt = content.slice(0, optionStart).trim().replace(/^\*\(pregunta de repaso del curso\)\*\s*/, '');
  const options = [...content.slice(optionStart).matchAll(/^- ([A-E])\) ([\s\S]*?)(?=\n- [A-E]\) |$)/gm)]
    .map(m => ({ id: m[1], text: m[2].trim() }));
  const solution = match[3].trim();
  const answerPrefix = solution.match(/^\*\*([A-E](?:[, y]+[A-E])*\.)\*\*\s*/);
  if (!answerPrefix) throw new Error(`Cannot read answer key for ${unitId ?? 'extra'}:${number}`);
  const correctIds = answerPrefix[1].match(/[A-E]/g);
  const explanation = solution.slice(answerPrefix[0].length).trim();
  const lessonIds = [...new Set([...explanation.matchAll(/\b([1-5]\.\d{2})\b/g)].map(m => m[1]))].filter(id => lessonMap.has(id));
  const line = source.slice(0, match.index).split('\n').length;
  const sourceLabel = `${exam ? 'Simulacro' : unitId ? `Unidad ${unitId}` : 'Práctica complementaria'} · TEMARIO.md:${line}`;
  questions.push({
    id: `q-${exam ? 'exam' : unitId ?? 'extra'}-${String(number).padStart(2, '0')}`,
    unitId: exam ? null : unitId, lessonIds, kind: correctIds.length > 1 ? 'multiple' : 'single',
    prompt, options, correctIds, explanation, exam, sourceLabel,
    sourceUrl: lessonMap.get(lessonIds[0])?.sourceUrl ?? 'https://cloud.google.com/learn/certification/generative-ai-leader',
  });
}

// Twenty compact definitions adapted from the outline's glossary/comparison tables.
const matchEntries = [
  ['1.3', 'Cuatro formas de crear valor', [
    ['Crear', 'Generar contenido nuevo.'], ['Resumir', 'Condensar grandes cantidades de información.'],
    ['Descubrir', 'Encontrar información y patrones en los datos.'], ['Automatizar', 'Realizar tareas que antes requerían intervención humana.'],
  ]],
  ['2.3', 'Conecta los fundamentos', [
    ['Aprendizaje automático', 'Aprender a partir de datos para realizar tareas específicas.'],
    ['Aprendizaje profundo', 'Aprendizaje automático que utiliza redes neuronales artificiales.'],
    ['Datos estructurados', 'Datos organizados con una estructura predefinida, fáciles de buscar.'],
    ['Alucinaciones', 'Resultados inexactos o sin una base en información real.'],
  ]],
  ['3.4', 'Cada herramienta tiene su lugar', [
    ['Agent Platform', 'Plataforma unificada para crear, entrenar e implementar modelos y aplicaciones de IA.'],
    ['Model Garden', 'Catálogo para descubrir, personalizar e implementar modelos existentes.'],
    ['Gemini', 'Modelo multimodal que comprende texto, imágenes, audio y video.'],
    ['Gemini Nano', 'Modelo compacto de Gemini que se ejecuta en el dispositivo.'],
  ]],
  ['4.3', 'Personaliza tus instrucciones', [
    ['Cadena de instrucciones', 'Conversación en la que cada respuesta se apoya en el contexto anterior.'],
    ['Información guardada', 'Información persistente que Gemini utiliza en todas las conversaciones.'],
    ['Gem', 'Asistente personalizado con instrucciones y recursos para una tarea específica.'],
    ['Fundamentación', 'Conectar los resultados de la IA con fuentes de información verificables.'],
  ]],
  ['5.4', 'Las piezas de un agente', [
    ['Temperatura', 'Controla la aleatoriedad al elegir las palabras de una respuesta.'],
    ['Token', 'Unidad en la que el modelo agrupa los caracteres del texto.'],
    ['API', 'Interfaz que permite a sistemas de software comunicarse y compartir información.'],
    ['Almacén de datos', 'Herramienta que ofrece al agente acceso a información o bases de conocimiento.'],
  ]],
];
const matches = matchEntries.map(([unitId, title, pairs], i) => ({
  id: `match-world-${i + 1}`, unitId, title,
  pairs: pairs.map(([term, definition], j) => ({ id: `pair-${i + 1}-${j + 1}`, term, definition })),
}));

const supplements = JSON.parse(await readFile(resolve(root, '../fuentes/complementos-autenticados/manifest.json'), 'utf8'));
const activities = new Map(supplements.activities.map(activity => [activity.id, activity]));
for (const enhancement of supplements.lessonEnhancements) {
  const { lessonId, activityId, ...fields } = enhancement;
  const lesson = lessonMap.get(lessonId);
  if (!lesson || !activities.has(activityId)) throw new Error(`Invalid enhancement reference: ${lessonId}/${activityId}`);
  if (Object.keys(fields).some(key => !['idea', 'keyPoints', 'example', 'distinctions'].includes(key))) {
    throw new Error(`Enhancement cannot change curriculum structure: ${lessonId}`);
  }
  Object.assign(lesson, fields);
}
for (const entry of supplements.questions) {
  const { activityId, ...question } = entry;
  const activity = activities.get(activityId);
  if (!activity || question.exam) throw new Error(`Invalid supplemental question: ${entry.id}`);
  const { activityType, url, language, courseVersion, verification, reviewedAt } = activity;
  questions.push({ ...question, sourceUrl: url, provenance: { activityType, url, language, courseVersion, verification, reviewedAt } });
}
const curriculum = { version: supplements.contentVersion, sourceDate: '2026-10-01', worlds, units, lessons, questions, matches };
await mkdir(resolve(root, 'src/data'), { recursive: true });
await writeFile(resolve(root, 'src/data/curriculum.json'), JSON.stringify(curriculum, null, 2) + '\n');
console.log(`Extracted ${worlds.length} worlds, ${units.length} units, ${lessons.length} lessons, ${questions.filter(q => !q.exam).length} practice + ${questions.filter(q => q.exam).length} exam questions, ${matches.length} matching sets.`);
console.log(`Source: ${lines.length} lines in ../TEMARIO.md; appendix excluded; original option order preserved.`);
console.log(`Added ${supplements.questions.length} original practice questions from ${activities.size} authenticated activities; ${supplements.lessonEnhancements.length} existing lessons enriched.`);
