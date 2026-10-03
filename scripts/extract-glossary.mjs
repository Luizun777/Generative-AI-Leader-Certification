import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Convierte la tabla «Glosario español-inglés» del temario en el mazo de tarjetas de src/data/glossary.json.
// Falla si la tabla cambia de forma, y deja escrito qué filas quedan fuera y cuáles se retocan.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'src/data/glossary.json');
const HEADING = '### Glosario español-inglés';
const HEADER = '| Término del curso | Variante en la guía del examen | Inglés | Definición breve | Lección |';
// Remite a otra sección del temario, que la app no incluye.
const DANGLING = / ?Ver "Lo que la guía pide y los cursos casi no tratan", en la sección 3\.$/;

const lines = (await readFile(resolve(root, '../TEMARIO.md'), 'utf8')).split('\n');
const curriculum = JSON.parse(await readFile(resolve(root, 'src/data/curriculum.json'), 'utf8'));
const lessonIds = new Set(curriculum.lessons.map(lesson => lesson.id));
const slug = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const heading = lines.indexOf(HEADING);
assert.ok(heading >= 0, `No encuentro «${HEADING}» en TEMARIO.md`);
const header = lines.findIndex((line, index) => index > heading && line.startsWith('|'));
assert.equal(lines[header], HEADER, 'La cabecera del glosario cambió');
assert.match(lines[header + 1], /^\|(-+\|)+$/, 'Falta la línea separadora de la tabla');

const cards = [];
const excluded = [];
const trimmed = [];
for (let index = header + 2; lines[index]?.startsWith('|'); index++) {
  const cells = lines[index].slice(1, -1).split('|').map(cell => cell.trim());
  assert.equal(cells.length, 5, `TEMARIO.md:${index + 1}: la fila no tiene cinco celdas`);
  assert.ok(cells.every(Boolean), `TEMARIO.md:${index + 1}: hay una celda vacía`);
  const [term, variant, english, definition, lesson] = cells;
  // Estas filas dicen qué pide la guía del examen, pero ninguna lección define el término: no hay nada que recordar.
  if (lesson === '-' || definition.startsWith('Guía oficial:')) { excluded.push(`TEMARIO.md:${index + 1} · ${term}`); continue; }
  const lessons = lesson.split(' y ');
  for (const id of lessons) assert.ok(lessonIds.has(id), `TEMARIO.md:${index + 1}: la lección «${id}» no existe`);
  if (DANGLING.test(definition)) trimmed.push(`TEMARIO.md:${index + 1} · ${term}`);
  cards.push({ id: slug(term), term, ...(variant === '-' ? {} : { variant }), english, definition: definition.replace(DANGLING, ''), lessons, line: index + 1 });
}
assert.equal(new Set(cards.map(card => card.id)).size, cards.length, 'Hay dos términos con el mismo identificador');
cards.sort((a, b) => a.lessons[0].localeCompare(b.lessons[0]) || a.term.localeCompare(b.term, 'es'));

await writeFile(target, `{\n  "source": "TEMARIO.md · Glosario español-inglés",\n  "cards": [\n${cards.map(card => `    ${JSON.stringify(card)}`).join(',\n')}\n  ]\n}\n`);
console.log(`PASS glosario: ${cards.length} tarjetas de ${cards.length + excluded.length} filas · ${cards.filter(card => card.variant).length} con variante de la guía · ${cards.filter(card => card.lessons.length > 1).length} en dos lecciones`);
console.log(`Fuera del mazo (${excluded.length}): la guía las nombra y ninguna lección las define.`);
for (const row of excluded) console.log(`  ${row}`);
console.log(`Sin la remisión final a otra sección (${trimmed.length}):`);
for (const row of trimmed) console.log(`  ${row}`);
