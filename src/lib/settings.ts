import type { KV } from './cache';

export interface Settings {
  labels: boolean;
  sort: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { labels: true, sort: false };

const KEY = 'settings';

export async function loadSettings(kv: KV): Promise<Settings> {
  const stored = (await kv.get(KEY)) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(kv: KV, s: Settings): Promise<void> {
  await kv.set(KEY, { ...s });
}
