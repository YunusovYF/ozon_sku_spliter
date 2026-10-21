import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestQueue } from '../src/lib/queue';
import { BlockedError } from '../src/lib/api';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function deferredWorker() {
  const started: string[] = [];
  const pending = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();
  const worker = (sku: string) =>
    new Promise<void>((resolve, reject) => {
      started.push(sku);
      pending.set(sku, { resolve, reject });
    });
  return { started, pending, worker };
}

describe('RequestQueue', () => {
  it('ignores duplicate sku', async () => {
    const w = vi.fn(async () => {});
    const q = new RequestQueue(w, { delayMs: 10 });
    q.add('a');
    q.add('a');
    await vi.runAllTimersAsync();
    q.add('a');
    await vi.runAllTimersAsync();
    expect(w).toHaveBeenCalledTimes(1);
  });

  it('runs at most `concurrency` workers at once', async () => {
    const d = deferredWorker();
    const q = new RequestQueue(d.worker, { concurrency: 2, delayMs: 10 });
    ['a', 'b', 'c', 'd'].forEach((s) => q.add(s));
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.started).toEqual(['a', 'b']);
    d.pending.get('a')!.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.started).toEqual(['a', 'b', 'c']);
  });

  it('prioritize moves sku to the front', async () => {
    const d = deferredWorker();
    const q = new RequestQueue(d.worker, { concurrency: 1, delayMs: 10 });
    q.add('a');
    q.add('b');
    q.add('c');
    q.prioritize('c');
    await vi.advanceTimersByTimeAsync(100);
    d.pending.get('a')!.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(d.started).toEqual(['a', 'c']);
  });

  it('stops on BlockedError and notifies once', async () => {
    const d = deferredWorker();
    const q = new RequestQueue(d.worker, { concurrency: 1, delayMs: 10 });
    const onBlocked = vi.fn();
    q.onBlocked = onBlocked;
    ['a', 'b', 'c'].forEach((s) => q.add(s));
    await vi.advanceTimersByTimeAsync(100);
    d.pending.get('a')!.reject(new BlockedError());
    await vi.advanceTimersByTimeAsync(1000);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(q.stopped).toBe(true);
    expect(d.started).toEqual(['a']);
  });

  it('continues after a plain error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deferredWorker();
    const q = new RequestQueue(d.worker, { concurrency: 1, delayMs: 10 });
    q.add('a');
    q.add('b');
    await vi.advanceTimersByTimeAsync(100);
    d.pending.get('a')!.reject(new Error('boom'));
    await vi.advanceTimersByTimeAsync(100);
    expect(d.started).toEqual(['a', 'b']);
    expect(q.stopped).toBe(false);
    warn.mockRestore();
  });

  it('waits delayMs between starts', async () => {
    const d = deferredWorker();
    const q = new RequestQueue(d.worker, { concurrency: 2, delayMs: 400 });
    q.add('a');
    q.add('b');
    await vi.advanceTimersByTimeAsync(0);
    expect(d.started).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(400);
    expect(d.started).toEqual(['a', 'b']);
  });
});
