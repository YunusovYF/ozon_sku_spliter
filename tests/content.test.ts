import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import filtersHtml from './fixtures/filters.html?raw';
import gridHtml from './fixtures/grid.html?raw';
import { start } from '../src/content/index';
import { listingPage } from './helpers';
import { memoryKV, type KV } from '../src/lib/cache';
import type { Settings } from '../src/lib/settings';

class StubIO {
  constructor(_cb: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

const VARIANTS: Record<string, number> = { '2043441656': 230, '4830673586': 50, '7777777777': 999 };
const PAGES: Record<string, ReturnType<typeof listingPage>> = {
  '/': listingPage([2043441656, 4830673586, 5555555555], '/p2', true),
  '/p2': listingPage([7777777777], null),
};

function variantResponse(variant: number | null) {
  const tabs = { tabs: { tabs: [{ title: 'Все отзывы' }, { title: `Этот вариант товара (${variant})` }] } };
  const widgetStates: Record<string, string> = {
    'webReviewProductScore-1-default-1': JSON.stringify({ reviewsCount: variant === null ? 400 : 16873 }),
  };
  if (variant !== null) widgetStates['webReviewsVariantMode-1-default-1'] = JSON.stringify(tabs);
  return JSON.stringify({ widgetStates });
}

const json = (body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

const okFetch = () =>
  vi.fn(async (url: string, _init?: RequestInit) => {
    const path = decodeURIComponent(url.split('url=')[1]);
    const review = path.match(/^\/product\/(\d+)\/reviews\/pdp-part$/);
    if (review) return json(variantResponse(VARIANTS[review[1]] ?? null));
    return json(PAGES[path] ?? { widgetStates: {} });
  });

type Handle = Awaited<ReturnType<typeof start>>;
let running: Handle[] = [];
async function run(opts: {
  kv?: KV;
  fetchFn?: ReturnType<typeof vi.fn>;
  settings?: Partial<Settings>;
  pages?: number;
}) {
  const kv = opts.kv ?? memoryKV();
  if (opts.settings) await kv.set('settings', opts.settings);
  const h = await start({
    root: document,
    kv,
    fetchFn: (opts.fetchFn ?? okFetch()) as unknown as typeof fetch,
    pages: opts.pages,
  });
  running.push(h);
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', StubIO);
  document.body.innerHTML = filtersHtml + '<div data-widget="infiniteVirtualPaginator">' + gridHtml + '</div>';
});
afterEach(() => {
  running.forEach((r) => r.stop());
  running = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const reviewSpan = (index: number) =>
  [...document.querySelectorAll(`[data-index="${index}"] span`)].find((s) =>
    /отзыв| из |^93$/.test(s.textContent ?? ''),
  ) as HTMLElement;

const viewSkus = (h: Handle) =>
  [...h.view()!.root.querySelectorAll('a.card')].map((a) => a.getAttribute('href')!.match(/(\d+)\/$/)![1]);
const viewHeader = (h: Handle) => h.view()?.root.querySelector('[data-ozon-sku-header]')?.textContent ?? '';
const paginator = () => document.querySelector<HTMLElement>('[data-widget="infiniteVirtualPaginator"]')!;

const toggle = (n: number) => document.querySelectorAll<HTMLInputElement>('[data-ozon-sku-toggles] input')[n];
const barText = (h: Handle) => h.bar.root.querySelector('div')?.textContent ?? '';

describe('labels', () => {
  it('labels every card of a sku with a single request', async () => {
    const f = okFetch();
    await run({ fetchFn: f });
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.mock.calls.filter(([u]) => u.includes('2043441656'))).toHaveLength(1);
    expect(reviewSpan(0).textContent).toBe('230 из 16 873');
    expect(reviewSpan(2).textContent).toBe('230 из 16 873');
  });

  it('restores label after re-render without a new request', async () => {
    const f = okFetch();
    await run({ fetchFn: f });
    await vi.advanceTimersByTimeAsync(5000);
    const calls = f.mock.calls.length;
    reviewSpan(0).textContent = '16 873 отзыва';
    await vi.advanceTimersByTimeAsync(1000);
    expect(reviewSpan(0).textContent).toBe('230 из 16 873');
    expect(f.mock.calls.length).toBe(calls);
  });

  it('uses cache instead of network', async () => {
    const kv = memoryKV();
    await kv.set('sku:2043441656', { r: { kind: 'variant', variant: 315, group: 16873 }, t: Date.now() });
    await kv.set('sku:4830673586', { r: { kind: 'single', group: 93 }, t: Date.now() });
    const f = okFetch();
    await run({ kv, fetchFn: f });
    await vi.advanceTimersByTimeAsync(5000);
    expect(f).not.toHaveBeenCalled();
    expect(reviewSpan(0).textContent).toBe('315 из 16 873');
    expect(reviewSpan(1).textContent).toBe('93');
  });

  it('restores label even under continuous mutations', async () => {
    await run({});
    await vi.advanceTimersByTimeAsync(5000);
    reviewSpan(0).textContent = '16 873 отзыва';
    const noise = document.createElement('div');
    document.body.append(noise);
    for (let i = 0; i < 30; i++) {
      noise.textContent = String(i);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(reviewSpan(0).textContent).toBe('230 из 16 873');
  });

  it('turning labels off restores original texts', async () => {
    await run({});
    await vi.advanceTimersByTimeAsync(5000);
    toggle(0).click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reviewSpan(0).textContent).toBe('16 873 отзыва');
  });

  it('does not request anything when both toggles are off', async () => {
    const f = okFetch();
    await run({ fetchFn: f, settings: { labels: false, sort: false } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(f).not.toHaveBeenCalled();
  });

  it('shows blocked status under the toggles', async () => {
    const f = vi.fn(async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    await run({ fetchFn: f });
    await vi.advanceTimersByTimeAsync(5000);
    expect(document.querySelector('[data-ozon-sku-toggles]')!.textContent).toContain('Ozon ограничил запросы');
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('sorting', () => {
  it('collects listing pages, shows progress, then a sorted list instead of the Ozon grid', async () => {
    const h = await run({ settings: { sort: true } });
    await vi.advanceTimersByTimeAsync(0);
    expect(paginator().style.display).toBe('none');
    expect(viewHeader(h)).toMatch(/Собираю отзывы \d+ \/ \d+/);
    await vi.advanceTimersByTimeAsync(10000);
    expect(viewSkus(h)).toEqual(['7777777777', '5555555555', '2043441656', '4830673586']);
    expect(viewHeader(h)).toContain('Товаров: 4');
    expect(h.view()!.root.textContent).toContain('230 из 16 873');
    expect(h.view()!.root.textContent).toContain('400 отзывов');
  });

  it('load more appends new items at the end and offers resort', async () => {
    const h = await run({ settings: { sort: true }, pages: 1 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(viewSkus(h)).toEqual(['5555555555', '2043441656', '4830673586']);
    [...h.view()!.root.querySelectorAll('button')].find((b) => b.textContent === 'Загрузить ещё')!.click();
    await vi.advanceTimersByTimeAsync(10000);
    expect(viewSkus(h)).toEqual(['5555555555', '2043441656', '4830673586', '7777777777']);
    expect(barText(h)).toMatch(/Пересортировать \(\+\d+\)/);
    h.bar.root.querySelector('button')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(viewSkus(h)[0]).toBe('7777777777');
    expect(barText(h)).toBe('');
  });

  it('turning sort off removes the list and restores the Ozon grid', async () => {
    await run({ settings: { sort: true } });
    await vi.advanceTimersByTimeAsync(10000);
    toggle(1).click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('[data-ozon-sku-view]')).toBeNull();
    expect(paginator().getAttribute('style')).toBeNull();
  });

  it('stops collecting and sorts what it has when Ozon blocks', async () => {
    const f = okFetch();
    f.mockImplementation(async (url: string) => {
      const path = decodeURIComponent(url.split('url=')[1]);
      if (path === '/') return json(PAGES['/']);
      return new Response('<html>', { headers: { 'content-type': 'text/html' } });
    });
    const h = await run({ settings: { sort: true }, fetchFn: f });
    await vi.advanceTimersByTimeAsync(10000);
    expect(viewSkus(h)).toHaveLength(3);
    expect(document.querySelector('[data-ozon-sku-toggles]')!.textContent).toContain('Ozon ограничил запросы');
  });

  it('survives Ozon re-rendering the paginator after load (hydration)', async () => {
    const f = okFetch();
    const h = await run({ settings: { sort: true }, fetchFn: f });
    await vi.advanceTimersByTimeAsync(10000);
    const listingCalls = f.mock.calls.filter(([u]) => !u.includes('reviews')).length;
    const old = paginator();
    const fresh = old.cloneNode(true) as HTMLElement;
    fresh.removeAttribute('style');
    fresh.removeAttribute('data-ozon-sku-style');
    old.parentElement!.replaceChild(fresh, old);
    h.view()!.root.remove();
    await vi.advanceTimersByTimeAsync(2000);
    expect(paginator()).toBe(fresh);
    expect(fresh.style.display).toBe('none');
    expect(fresh.previousElementSibling?.hasAttribute('data-ozon-sku-view')).toBe(true);
    expect(viewSkus(h)).toHaveLength(4);
    expect(f.mock.calls.filter(([u]) => !u.includes('reviews')).length).toBe(listingCalls);
  });

  it('labels toggle also switches the sorted list between real and Ozon counts', async () => {
    const h = await run({ settings: { sort: true } });
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.view()!.root.textContent).toContain('230 из 16 873');
    toggle(0).click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.view()!.root.textContent).not.toContain('230 из');
    expect(h.view()!.root.textContent).toContain('16 873 отзыва');
    expect(viewSkus(h)).toEqual(['7777777777', '5555555555', '2043441656', '4830673586']);
  });

  it('does not touch pages without the filters panel (e.g. home feed)', async () => {
    document.querySelector('[data-widget="filtersDesktop"]')!.remove();
    const f = okFetch();
    await run({ settings: { sort: true }, fetchFn: f });
    await vi.advanceTimersByTimeAsync(10000);
    expect(paginator().getAttribute('style')).toBeNull();
    expect(document.querySelector('[data-ozon-sku-view]')).toBeNull();
    expect(f.mock.calls.filter(([u]) => !u.includes('reviews'))).toHaveLength(0);
  });

  it('gives the Ozon grid back when the listing cannot be loaded', async () => {
    const f = okFetch();
    f.mockImplementation(async (url: string) => {
      const path = decodeURIComponent(url.split('url=')[1]);
      if (path.includes('reviews')) return json(variantResponse(1));
      return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } });
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run({ settings: { sort: true }, fetchFn: f });
    await vi.advanceTimersByTimeAsync(10000);
    expect(paginator().getAttribute('style')).toBeNull();
    expect(document.querySelector('[data-ozon-sku-view]')).toBeNull();
    expect(document.querySelector('[data-ozon-sku-toggles]')!.textContent).toContain('Не удалось');
  });

  it('gives the Ozon grid back when the listing is empty', async () => {
    const f = okFetch();
    f.mockImplementation(async () => json({ widgetStates: {} }));
    await run({ settings: { sort: true }, fetchFn: f });
    await vi.advanceTimersByTimeAsync(10000);
    expect(paginator().getAttribute('style')).toBeNull();
  });

  it('does not fetch more listing pages after sort is switched off mid-crawl', async () => {
    const f = okFetch();
    await run({ settings: { sort: true }, fetchFn: f });
    await vi.advanceTimersByTimeAsync(0);
    toggle(1).click();
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.mock.calls.filter(([u]) => !u.includes('reviews'))).toHaveLength(1);
  });

  it('a failed cache read does not hang the progress forever', async () => {
    const kv = memoryKV();
    const get = kv.get.bind(kv);
    kv.get = async (k: string) => (k === 'sku:7777777777' ? Promise.reject(new Error('ctx invalidated')) : get(k));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = await run({ settings: { sort: true }, kv });
    await vi.advanceTimersByTimeAsync(10000);
    expect(viewHeader(h)).toContain('Отсортировано');
  });

  it('marks the sorted list as partial when Ozon blocked collecting', async () => {
    const f = okFetch();
    f.mockImplementation(async (url: string) => {
      const path = decodeURIComponent(url.split('url=')[1]);
      if (path === '/') return json(PAGES['/']);
      return new Response('<html>', { headers: { 'content-type': 'text/html' } });
    });
    const h = await run({ settings: { sort: true }, fetchFn: f });
    await vi.advanceTimersByTimeAsync(10000);
    expect(viewHeader(h)).toContain('частично');
  });

  it('stops observing Ozon cards that were removed from the page', async () => {
    const unobserve = vi.fn();
    class TrackIO extends StubIO {
      unobserve = unobserve;
    }
    vi.stubGlobal('IntersectionObserver', TrackIO);
    await run({});
    await vi.advanceTimersByTimeAsync(5000);
    document.querySelector('[data-index="1"]')!.remove();
    await vi.advanceTimersByTimeAsync(2000);
    expect(unobserve).toHaveBeenCalled();
  });
});
