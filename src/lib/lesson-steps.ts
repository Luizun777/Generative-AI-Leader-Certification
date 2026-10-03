import type { Lesson } from '../types';

export type FragmentKey = 'idea' | 'point1' | 'point2' | 'point3' | 'point4' | 'example' | 'dist1' | 'dist2';
// Fragments that came from a table row lost their column headings; these rewrites restore the meaning
// without touching the frozen curriculum. Each one cites the line of the outline it comes from.
export type LessonOverrides = Record<string, Partial<Record<FragmentKey, { text: string; source: string }>>>;
export type StepKind = 'idea' | 'point' | 'example' | 'distinction';
export interface LessonStep { kind: StepKind; index: number; of: number; text: string }

// The lesson as one short card per step: idea, each key point, the example and each distinction.
export function lessonSteps(lesson: Lesson, overrides: LessonOverrides = {}): LessonStep[] {
  const own = overrides[lesson.id] ?? {};
  const pick = (key: FragmentKey, text: string) => own[key]?.text ?? text;
  const distinctions = lesson.distinctions ? lesson.distinctions.split('\n\n') : [];
  return [
    { kind: 'idea', index: 1, of: 1, text: pick('idea', lesson.idea) },
    ...lesson.keyPoints.map((text, index): LessonStep => ({ kind: 'point', index: index + 1, of: lesson.keyPoints.length, text: pick(`point${index + 1}` as FragmentKey, text) })),
    ...(lesson.example ? [{ kind: 'example', index: 1, of: 1, text: pick('example', lesson.example) } as const] : []),
    ...distinctions.map((text, index): LessonStep => ({ kind: 'distinction', index: index + 1, of: distinctions.length, text: pick(`dist${index + 1}` as FragmentKey, text) })),
  ];
}

const LABEL = /^(\p{Lu}[^:.;,]{1,44}|\d{4}): (.+)$/su;
// «Label: one; two; three» reads better as a subtitle and a list than as one run-on line.
export function formatFragment(text: string): { label?: string; items: string[] } {
  const match = LABEL.exec(text);
  if (!match) return { items: [text] };
  const items = match[2].split('; ').map(part => part.trim()).filter(Boolean);
  // «…; y que…» is one sentence going on, not a list.
  return { label: match[1], items: items.some(item => /^[yoeu] /.test(item)) ? [match[2]] : items };
}
