import type { ReviewsResult } from './api';

export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export function chromeKV(): KV {
  return {
    async get(key) {
      return (await chrome.storage.local.get(key))[key];
    },
    async set(key, value) {
      await chrome.storage.local.set({ [key]: value });
    },
  };
}

export function memoryKV(): KV {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
  };
}

interface Entry {
  r: ReviewsResult;
  t: number;
}

export class ReviewsCache {
  constructor(
    private kv: KV,
    private ttlMs = 6 * 3600_000,
    private now: () => number = Date.now,
  ) {}

  async get(sku: string): Promise<ReviewsResult | null> {
    const e = (await this.kv.get(`sku:${sku}`)) as Entry | undefined;
    if (!e || this.now() - e.t > this.ttlMs) return null;
    return e.r;
  }

  async set(sku: string, r: ReviewsResult): Promise<void> {
    await this.kv.set(`sku:${sku}`, { r, t: this.now() } satisfies Entry);
  }
}
