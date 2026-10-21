import { describe, expect, it } from 'vitest';
import { memoryKV, ReviewsCache } from '../src/lib/cache';

describe('ReviewsCache', () => {
  it('returns value before TTL and null after', async () => {
    let now = 1_000;
    const cache = new ReviewsCache(memoryKV(), 100, () => now);
    await cache.set('42', { kind: 'variant', variant: 1, group: 2 });
    now = 1_099;
    expect(await cache.get('42')).toEqual({ kind: 'variant', variant: 1, group: 2 });
    now = 1_101;
    expect(await cache.get('42')).toBeNull();
  });
  it('returns null for unknown sku', async () => {
    expect(await new ReviewsCache(memoryKV()).get('nope')).toBeNull();
  });
});
