import { parseCount } from './text';

export type ReviewsResult =
  | { kind: 'variant'; variant: number; group: number }
  | { kind: 'single'; group: number | null };

/** Ozon ограничил запросы (403/429 или страница антибота вместо JSON). */
export class BlockedError extends Error {
  constructor(message = 'Ozon blocked the request') {
    super(message);
    this.name = 'BlockedError';
  }
}

const VARIANT_TAB_RE = /Этот вариант[^(]*\(([^)]+)\)/;

function findState(states: Record<string, unknown>, prefix: string): any {
  const key = Object.keys(states).find((k) => k.startsWith(prefix));
  if (!key) return undefined;
  const raw = states[key];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/** Разбор ответа /product/<SKU>/reviews/pdp-part. */
export function parseVariantResponse(json: unknown): ReviewsResult {
  const states = (json as { widgetStates?: unknown } | null)?.widgetStates;
  if (!states || typeof states !== 'object') throw new Error('widgetStates not found');
  const map = states as Record<string, unknown>;

  const score = findState(map, 'webReviewProductScore-');
  const group = typeof score?.reviewsCount === 'number' ? score.reviewsCount : null;

  const mode = findState(map, 'webReviewsVariantMode-');
  const titles: unknown[] = mode?.tabs?.tabs?.map((t: { title?: unknown }) => t.title) ?? [];
  for (const title of titles) {
    const m = typeof title === 'string' ? title.match(VARIANT_TAB_RE) : null;
    const variant = m ? parseCount(m[1]) : null;
    if (variant !== null) {
      if (group === null) throw new Error('group reviewsCount not found');
      return { kind: 'variant', variant, group };
    }
  }
  if (mode) throw new Error('variant tab not recognized');
  return { kind: 'single', group };
}

export async function fetchVariantReviews(
  sku: string,
  fetchFn: typeof fetch = fetch,
): Promise<ReviewsResult> {
  const url =
    'https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=' + encodeURIComponent(`/product/${sku}/reviews/pdp-part`);
  const res = await fetchFn(url, { credentials: 'include' });
  if (res.status === 403 || res.status === 429) throw new BlockedError(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for sku ${sku}`);
  if (!(res.headers.get('content-type') ?? '').includes('json')) throw new BlockedError('non-JSON response');
  return parseVariantResponse(await res.json());
}
