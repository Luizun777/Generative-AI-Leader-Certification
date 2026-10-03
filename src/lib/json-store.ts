export interface KeyValueAdapter {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
}

// Device-only data (preferences, practice state) lives outside Progress so backups keep the shape
// that released builds accept. Reads are tolerant: anything unreadable becomes sanitize(undefined).
export function createJsonStore<T>(adapter: KeyValueAdapter, key: string, sanitize: (raw: unknown) => T) {
  let queue: Promise<void> = Promise.resolve();
  let readFailed = false;
  return {
    async load(): Promise<T> {
      await queue;
      let value: string | null;
      try { ({ value } = await adapter.get({ key })); }
      catch { readFailed = true; return sanitize(undefined); }
      readFailed = false;
      if (value === null) return sanitize(undefined);
      try { return sanitize(JSON.parse(value)); } catch { return sanitize(undefined); }
    },
    // Resolves to false instead of rejecting: a failed write must never interrupt studying.
    save(value: T): Promise<boolean> {
      // Storage that could not be read is left untouched until a later load succeeds.
      if (readFailed) return Promise.resolve(false);
      const snapshot = JSON.stringify(sanitize(value));
      const write = queue.then(() => adapter.set({ key, value: snapshot }));
      queue = write.then(() => undefined, () => undefined);
      return write.then(() => true, () => false);
    },
  };
}
