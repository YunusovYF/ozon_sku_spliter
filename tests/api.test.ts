import { describe, expect, it, vi } from 'vitest';
import variantFixture from './fixtures/pdp-part-variant.json';
import singleFixture from './fixtures/pdp-part-single.json';
import { BlockedError, fetchVariantReviews, parseVariantResponse } from '../src/lib/api';

function withVariantTitle(title: string) {
  const json = structuredClone(variantFixture) as { widgetStates: Record<string, string> };
  const key = Object.keys(json.widgetStates).find((k) => k.startsWith('webReviewsVariantMode-'))!;
  const state = JSON.parse(json.widgetStates[key]);
  state.tabs.tabs[1].title = title;
  json.widgetStates[key] = JSON.stringify(state);
  return json;
}

function mockFetch(status: number, contentType: string, body: string) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, { status, headers: { 'content-type': contentType } }));
}

describe('parseVariantResponse', () => {
  it('reads variant and group counts', () => {
    expect(parseVariantResponse(variantFixture)).toEqual({ kind: 'variant', variant: 230, group: 16873 });
  });
  it('returns single when there is no variant tab', () => {
    expect(parseVariantResponse(singleFixture)).toEqual({ kind: 'single', group: 16873 });
  });
  it('parses variant count with thousands separator', () => {
    expect(parseVariantResponse(withVariantTitle('Этот вариант товара (1 234)'))).toMatchObject({ variant: 1234 });
  });
  it('throws on unexpected structure', () => {
    expect(() => parseVariantResponse({ foo: 1 })).toThrow();
  });
});

describe('fetchVariantReviews', () => {
  it('requests pdp-part for the sku', async () => {
    const f = mockFetch(200, 'application/json', JSON.stringify(variantFixture));
    await fetchVariantReviews('2043441656', f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toBe(
      'https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fproduct%2F2043441656%2Freviews%2Fpdp-part',
    );
  });
  it('treats html 200 (antibot page) as blocked', async () => {
    const f = mockFetch(200, 'text/html', '<html>Antibot</html>');
    await expect(fetchVariantReviews('1', f as unknown as typeof fetch)).rejects.toBeInstanceOf(BlockedError);
  });
  it('treats 429 as blocked', async () => {
    const f = mockFetch(429, 'application/json', '{}');
    await expect(fetchVariantReviews('1', f as unknown as typeof fetch)).rejects.toBeInstanceOf(BlockedError);
  });
  it('treats 500 as plain error', async () => {
    const f = mockFetch(500, 'application/json', '{}');
    const err = await fetchVariantReviews('1', f as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BlockedError);
  });
});
