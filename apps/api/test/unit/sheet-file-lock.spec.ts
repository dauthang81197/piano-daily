import { describe, expect, it } from 'vitest';
import { withSheetFileLock } from '../../src/modules/catalog/sheet-file-lock';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('withSheetFileLock', () => {
  it('serializes mutations for one Sheet and releases the queue after completion', async () => {
    const entered = deferred();
    const release = deferred();
    const order: string[] = [];

    const first = withSheetFileLock('sheet-a', async () => {
      order.push('first:start');
      entered.resolve();
      await release.promise;
      order.push('first:end');
    });
    await entered.promise;

    const second = withSheetFileLock('sheet-a', async () => {
      order.push('second');
    });
    await Promise.resolve();
    expect(order).toEqual(['first:start']);

    release.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);

    await withSheetFileLock('sheet-a', async () => { order.push('third'); });
    expect(order.at(-1)).toBe('third');
  });

  it('does not block a different Sheet', async () => {
    const release = deferred();
    const entered = deferred();
    const first = withSheetFileLock('sheet-a', async () => { await release.promise; });
    const second = withSheetFileLock('sheet-b', async () => { entered.resolve(); });

    await entered.promise;
    release.resolve();
    await Promise.all([first, second]);
  });
});
