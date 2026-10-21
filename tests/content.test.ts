import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import html from './fixtures/grid.html?raw';
import variantFixture from './fixtures/pdp-part-variant.json';
import { start } from '../src/content/index';
import { memoryKV } from '../src/lib/cache';

class StubIO {
  constructor(_cb: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

let running: { stop(): void }[] = [];
const run = (opts: Parameters<typeof start>[0]) => {
  const r = start(opts);
  running.push(r);
  return r;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', StubIO);
  document.body.innerHTML = html;
});
afterEach(() => {
  running.forEach((r) => r.stop());
  running = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const jsonFetch = () =>
  vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(variantFixture), { headers: { 'content-type': 'application/json' } }),
  );

const reviewTexts = () =>
  [...document.querySelectorAll('[data-index]')].map(
    (c) => [...c.querySelectorAll('span')].find((s) => /отзыв| из |^93$/.test(s.textContent ?? ''))?.textContent,
  );

describe('content script', () => {
  it('labels every card of a sku with a single request', async () => {
    const f = jsonFetch();
    run({ root: document, kv: memoryKV(), fetchFn: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    const skuCalls = f.mock.calls.filter(([u]) => u.includes('2043441656'));
    expect(skuCalls).toHaveLength(1);
    expect(reviewTexts()[0]).toBe('230 из 16 873');
    expect(reviewTexts()[2]).toBe('230 из 16 873');
  });

  it('restores label after re-render without a new request', async () => {
    const f = jsonFetch();
    run({ root: document, kv: memoryKV(), fetchFn: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    const calls = f.mock.calls.length;
    const span = [...document.querySelectorAll('[data-index="0"] span')].find((s) =>
      s.textContent?.includes(' из '),
    )!;
    span.textContent = '16 873 отзыва';
    await vi.advanceTimersByTimeAsync(1000);
    expect(span.textContent).toBe('230 из 16 873');
    expect(f.mock.calls.length).toBe(calls);
  });

  it('shows blocked message when ozon returns html', async () => {
    const f = vi.fn(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    const { panel } = run({ root: document, kv: memoryKV(), fetchFn: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    expect(panel.root.textContent).toContain('Ozon ограничил запросы');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('uses cache instead of network', async () => {
    const kv = memoryKV();
    await kv.set('sku:2043441656', { r: { kind: 'variant', variant: 315, group: 16873 }, t: Date.now() });
    await kv.set('sku:4830673586', { r: { kind: 'single', group: 93 }, t: Date.now() });
    const f = jsonFetch();
    run({ root: document, kv, fetchFn: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    expect(f).not.toHaveBeenCalled();
    expect(reviewTexts()[0]).toBe('315 из 16 873');
    expect(reviewTexts()[1]).toBe('93');
  });
  it('drops products that left the page from the top (SPA navigation)', async () => {
    const f = jsonFetch();
    const { panel } = run({ root: document, kv: memoryKV(), fetchFn: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    document.querySelectorAll('[data-index="0"], [data-index="2"]').forEach((e) => e.remove());
    await vi.advanceTimersByTimeAsync(1000);
    const hrefs = [...panel.root.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.includes('2043441656'))).toBe(false);
    expect(hrefs.some((h) => h?.includes('4830673586'))).toBe(true);
  });

  it('restores label even under continuous mutations', async () => {
    const f = jsonFetch();
    run({ root: document, kv: memoryKV(), fetchFn: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    const span = [...document.querySelectorAll('[data-index="0"] span')].find((s) =>
      s.textContent?.includes(' из '),
    )!;
    span.textContent = '16 873 отзыва';
    const noise = document.createElement('div');
    document.body.append(noise);
    for (let i = 0; i < 30; i++) {
      noise.textContent = String(i);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(span.textContent).toBe('230 из 16 873');
  });
  it('panel links are rebuilt from sku, not copied from the page', async () => {
    const f = jsonFetch();
    const { panel } = run({ root: document, kv: memoryKV(), fetchFn: f as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    const hrefs = [...panel.root.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://www.ozon.ru/product/2043441656/');
  });
});
