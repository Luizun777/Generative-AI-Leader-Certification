import type { Progress } from './types';
type Context = { registerTool(tool: {name: string;title: string;description: string;inputSchema: object;annotations?: {readOnlyHint: boolean};execute: (input: unknown) => unknown | Promise<unknown>}, options?: {signal: AbortSignal}): void | Promise<void> };
export function registerStudyTools(getProgress: () => Progress | null, openQuickReview: () => void) {
  const context = (document as Document & {modelContext?: Context}).modelContext;
  if (!context?.registerTool) return () => {};
  const controller = new AbortController();
  function emptyInput(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Esta herramienta no acepta parámetros.');
  }
  const tools = [{
    name: 'get_study_progress', title: 'Consultar mi avance', description: 'Lee el progreso local de Pliegue IA: puntos, lecciones completadas y errores pendientes.',
    inputSchema: {type:'object',properties:{},additionalProperties:false}, annotations: {readOnlyHint:true},
    execute(input: unknown) { emptyInput(input); const progress = getProgress(); if (!progress) throw new Error('El progreso todavía no está disponible.'); return {xp:progress.xp,completedLessons:progress.completedLessons.length,mistakes:Object.values(progress.answers).filter(answer => !answer.lastCorrect).length,streak:progress.streak.current}; }
  }, {
    name: 'open_quick_review', title: 'Abrir repaso rápido', description: 'Abre la configuración del repaso rápido. No inicia ni responde una sesión de estudio.',
    inputSchema: {type:'object',properties:{},additionalProperties:false}, annotations: {readOnlyHint:false},
    async execute(input: unknown) { emptyInput(input); openQuickReview(); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); return {view:'quick-review-configuration'}; }
  }];
  for (const tool of tools) {
    try { void Promise.resolve(context.registerTool(tool, {signal:controller.signal})).catch(error => console.warn('Herramientas de estudio no disponibles.',error)); }
    catch (error) { console.warn('Herramientas de estudio no disponibles.',error); }
  }
  return () => controller.abort();
}
