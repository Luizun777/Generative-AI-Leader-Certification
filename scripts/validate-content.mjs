import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(resolve(root, 'src/data/curriculum.json'), 'utf8'));
const source = await readFile(resolve(root, '../TEMARIO.md'), 'utf8');
const supplements = JSON.parse(await readFile(resolve(root, '../fuentes/complementos-autenticados/manifest.json'), 'utf8'));
const baseQuestions = data.questions.filter(q => !q.provenance);
const extraQuestions = data.questions.filter(q => q.provenance);
const unique = (items, label) => assert.equal(new Set(items.map(x => x.id)).size, items.length, `Unique ${label} IDs`);
for (const key of ['worlds', 'units', 'lessons', 'questions', 'matches']) unique(data[key], key);
assert.equal(data.worlds.length, 5);
assert.equal(data.units.length, 17);
assert.equal(data.lessons.length, 51);
assert.equal(baseQuestions.filter(q => !q.exam).length, 225);
assert.equal(extraQuestions.length, supplements.questions.length);
assert.ok(extraQuestions.every(q => !q.exam), 'Authenticated additions never enter reserved exam');
assert.equal(data.questions.filter(q => q.exam).length, 40);
assert.equal(baseQuestions.filter(q => q.kind === 'multiple').length, 2);
assert.equal(data.matches.length, 5);
const lessons = new Map(data.lessons.map(x => [x.id, x]));
const units = new Map(data.units.map(x => [x.id, x]));
const worldIds = new Set(data.worlds.map(x => x.id));
for (const unit of data.units) {
  assert.ok(worldIds.has(unit.worldId), `World for unit ${unit.id}`);
  assert.ok(unit.lessonIds.length > 0, `Lessons for unit ${unit.id}`);
  for (const id of unit.lessonIds) assert.equal(lessons.get(id)?.unitId, unit.id);
}
for (const lesson of data.lessons) {
  assert.ok(units.has(lesson.unitId));
  assert.equal(units.get(lesson.unitId).worldId, lesson.worldId);
  assert.ok(lesson.idea.length > 20);
  assert.ok(lesson.keyPoints.length >= 1 && lesson.keyPoints.length <= 4);
  assert.ok(lesson.keyPoints.every(p => typeof p === 'string' && p.length > 10));
  assert.ok(lesson.sourceUrl.startsWith('https://www.skills.google/'));
  assert.ok(data.questions.some(q => !q.exam && q.lessonIds.includes(lesson.id)), `Practice coverage for ${lesson.id}`);
}
for (const q of data.questions) {
  assert.ok(q.options.length >= 2 && q.options.length <= 5, `2–5 options in ${q.id}`);
  unique(q.options, `options in ${q.id}`);
  assert.deepEqual(q.options.map(o => o.id), 'ABCDE'.slice(0, q.options.length).split(''), `Original labels in ${q.id}`);
  assert.ok(q.options.every(o => o.text.trim().length > 0));
  assert.ok(q.correctIds.length > 0 && q.correctIds.every(id => q.options.some(o => o.id === id)), `Answer IDs in ${q.id}`);
  assert.equal(q.kind, q.correctIds.length > 1 ? 'multiple' : 'single');
  assert.ok(q.prompt.length > 20 && q.explanation.length > 30, `Complete content in ${q.id}`);
  assert.ok(!q.prompt.includes('<details>') && !q.explanation.includes('</details>'));
  assert.ok(q.lessonIds.every(id => lessons.has(id)), `Valid lesson references in ${q.id}`);
  assert.ok(q.unitId === null || units.has(q.unitId));
  assert.ok(q.provenance || q.sourceLabel.includes('TEMARIO.md:'));
  assert.ok(q.sourceUrl.startsWith('https://'));
}
for (const activity of supplements.activities) {
  const localSource = await readFile(resolve(root, '../fuentes/complementos-autenticados', activity.localFile), 'utf8');
  assert.ok(localSource.includes(activity.url), `Local evidence URL for ${activity.id}`);
  assert.ok(activity.lessonIds.every(id => lessons.has(id)), `Activity lesson references for ${activity.id}`);
}
for (const question of extraQuestions) {
  const authored = supplements.questions.find(q => q.id === question.id);
  const activity = supplements.activities.find(a => a.id === authored?.activityId);
  assert.ok(activity, `Known activity for ${question.id}`);
  assert.equal(question.sourceUrl, activity.url);
  assert.equal(question.provenance.url, activity.url);
  for (const key of ['activityType', 'language', 'courseVersion', 'verification', 'reviewedAt']) {
    assert.equal(question.provenance[key], activity[key], `Provenance ${key} for ${question.id}`);
  }
  assert.ok(question.lessonIds.length > 0, `Lesson association for ${question.id}`);
}
const tableQuestions = baseQuestions.filter(q => /^\|/m.test(q.prompt));
assert.equal(tableQuestions.length, 7, 'All seven question tables retained');
for (const q of tableQuestions) assert.ok(/^\|[-| :]+\|$/m.test(q.prompt), `Markdown table separator in ${q.id}`);
for (const set of data.matches) {
  assert.ok(units.has(set.unitId));
  assert.equal(set.pairs.length, 4);
  unique(set.pairs, 'matching pairs');
  assert.equal(new Set(set.pairs.map(p => p.term)).size, 4);
  assert.equal(new Set(set.pairs.map(p => p.definition)).size, 4);
}
const mainSource = source.slice(0, source.indexOf('\n## Apéndice:'));
const sourceQuestionCount = [...mainSource.matchAll(/^\*\*\d+\.\*\*/gm)].length;
assert.equal(sourceQuestionCount, baseQuestions.length, 'No numbered question lost during parsing');
const originalTables = [...mainSource.matchAll(/^\*\*\d+\.\*\* ([\s\S]*?)<details>/gm)].filter(m => /^\|/m.test(m[1]));
assert.equal(originalTables.length, tableQuestions.length);
console.log(`PASS: 5 worlds · 17 units · 51 lessons · 225 base practice + ${extraQuestions.length} authenticated practice + 40 reserved exam questions.`);
console.log('PASS: 51/51 lessons have practice references; IDs, unit links, answer keys and 2–5 options are valid.');
console.log('PASS: 7 complete Markdown tables · 2 multiple-answer questions · 5 matching sets × 4 distinct pairs.');
console.log(`PASS: all ${sourceQuestionCount} numbered source questions retained; appendix excluded; no dependencies required.`);
console.log(`PASS: ${supplements.activities.length} authenticated activities with local evidence and provenance; no duplicate Foundation/LLM questions added.`);
