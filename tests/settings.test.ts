import { describe, expect, it } from 'vitest';
import { memoryKV } from '../src/lib/cache';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/lib/settings';

describe('settings', () => {
  it('returns defaults for empty storage', async () => {
    expect(await loadSettings(memoryKV())).toEqual({ labels: true, sort: false });
    expect(DEFAULT_SETTINGS).toEqual({ labels: true, sort: false });
  });
  it('fills missing fields with defaults', async () => {
    const kv = memoryKV();
    await kv.set('settings', { sort: true });
    expect(await loadSettings(kv)).toEqual({ labels: true, sort: true });
  });
  it('round-trips saved settings', async () => {
    const kv = memoryKV();
    await saveSettings(kv, { labels: false, sort: true });
    expect(await loadSettings(kv)).toEqual({ labels: false, sort: true });
  });
});
