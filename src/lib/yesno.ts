import type { Question } from '../types';

export interface YesNoItem { questionId: string; optionId: string; truth: boolean }

// «¿Es correcta esta respuesta?» only works when each option is right or wrong on its own:
// a stem that asks for the best fit has options that are partly right.
const BEST_FIT = /\b(mejor|peor|sobre todo|principal(es)?|más (adecuad|apropiad|eficaz|eficiente|probable|indicad|conveniente)\p{L}*)\b/iu;
// The explanation must not point at «la opción A»: the letters are not on screen here.
const LETTER = /\b(opción|opciones|alternativa|respuesta)s? [A-E]\b/;
const asked = (prompt: string) => prompt.slice(Math.max(0, prompt.lastIndexOf('¿')));
const plain = (text: string) => !text.includes('|');

export function eligibleYesNo(questions: readonly Question[]): Question[] {
  return questions.filter(question => !question.exam && question.kind === 'single' && question.correctIds.length === 1 && question.options.length >= 3
    && plain(question.prompt) && question.options.every(option => plain(option.text)) && !LETTER.test(question.explanation) && !BEST_FIT.test(asked(question.prompt)));
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) { const other = Math.floor(rng() * (index + 1)); [result[index], result[other]] = [result[other], result[index]]; }
  return result;
}

// Half of the proposed answers are right and half are wrong, in random order, so a round never has a single right reply.
export function buildRound(questions: readonly Question[], size: number, rng: () => number = Math.random): YesNoItem[] {
  const chosen = shuffled(questions, rng).slice(0, size);
  const right = Math.floor(chosen.length / 2) + (chosen.length % 2 && rng() < 0.5 ? 1 : 0);
  const truths = shuffled(chosen.map((_, index) => index < right), rng);
  return chosen.map((question, index) => {
    const wrong = question.options.filter(option => !question.correctIds.includes(option.id));
    return { questionId: question.id, truth: truths[index], optionId: truths[index] ? question.correctIds[0] : wrong[Math.floor(rng() * wrong.length)].id };
  });
}

export const judge = (item: YesNoItem, saidYes: boolean) => saidYes === item.truth;
