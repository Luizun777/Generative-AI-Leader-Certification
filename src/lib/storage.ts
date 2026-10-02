import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { Curriculum, Progress } from '../types';
import { makeBackup, newProgress, validateProgress } from './engine';

const STORAGE_KEY = 'pliegue-ia.progress.v1';
interface PreferenceAdapter {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
}

// Each store owns its write queue; injection lets tests exercise real race/failure behavior.
export function createProgressStore(adapter: PreferenceAdapter) {
  let queue: Promise<void> = Promise.resolve();
  let curriculum: Curriculum | null = null;
  let corruptData = false;
  let readReady = false;
  return {
    async loadProgress(current: Curriculum): Promise<Progress> {
      readReady = false;
      await queue;
      const { value } = await adapter.get({ key: STORAGE_KEY });
      if (value === null) { curriculum = current; corruptData = false; readReady = true; return newProgress(current.version); }
      try {
        const progress = validateProgress(JSON.parse(value), current);
        curriculum = current;
        corruptData = false;
        readReady = true;
        return progress;
      } catch (error) {
        corruptData = true;
        throw new Error('No se pudo leer el progreso guardado. Se conservó intacto; importa un respaldo válido para recuperarlo.', { cause: error });
      }
    },
    saveProgress(progress: Progress): Promise<void> {
      if (corruptData) return Promise.reject(new Error('El progreso guardado está dañado; no se sobrescribirá automáticamente.'));
      if (!curriculum || !readReady) return Promise.reject(new Error('Primero carga el progreso antes de guardarlo.'));
      let snapshot: string;
      try { snapshot = JSON.stringify(validateProgress(progress, curriculum)); }
      catch (error) { return Promise.reject(error); }
      const write = queue.then(() => adapter.set({ key: STORAGE_KEY, value: snapshot }));
      // A rejected write must be reported to its caller without poisoning later retries.
      queue = write.catch(() => undefined);
      return write;
    },
    async restoreProgress(progress: Progress, current: Curriculum): Promise<void> {
      const valid = validateProgress(progress, current);
      const snapshot = JSON.stringify(valid);
      const write = queue.then(() => adapter.set({ key: STORAGE_KEY, value: snapshot }));
      queue = write.catch(() => undefined);
      await write;
      curriculum = current;
      corruptData = false;
      readReady = true;
    },
  };
}

const store = createProgressStore(Preferences);
export const loadProgress = store.loadProgress;
export const saveProgress = store.saveProgress;
export const restoreProgress = store.restoreProgress;

export async function exportBackup(progress: Progress): Promise<void> {
  const backup = makeBackup(progress);
  const text = JSON.stringify(backup, null, 2);
  const filename = `pliegue-ia-respaldo-${backup.exportedAt.slice(0, 10)}.json`;
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: text, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Respaldo de Pliegue IA', files: [uri], dialogTitle: 'Guardar o compartir respaldo' });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Let the browser start reading the Blob before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
