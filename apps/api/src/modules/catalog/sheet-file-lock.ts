/** In-process lock shared by upload, file removal, Sheet deletion, and GC (API runs one instance). */
const queues = new Map<string, Promise<void>>();

export async function withSheetFileLock<T>(sheetId: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(sheetId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  queues.set(sheetId, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (queues.get(sheetId) === tail) queues.delete(sheetId);
  }
}
