import { fetchEntrypoint } from './api';
import { parseCount } from './text';

export interface ListingItem {
  sku: string;
  href: string;
  title: string;
  image: string | null;
  price: string | null;
  oldPrice: string | null;
  rating: string | null;
  groupReviews: number | null;
  /** Все фото карточки (галерея). */
  images: string[];
  badge: string | null;
  /** «89 ед осталось» и т. п. */
  stock: string | null;
  discount: string | null;
  /** Текст кнопки корзины — обычно срок доставки («Завтра»). */
  cartTitle: string | null;
  inCart: number;
  isFav: boolean;
  /** Есть кнопка «В корзину» (нет — товар не в наличии и т. п.). */
  canBuy: boolean;
  /** Цвет цены (Ozon красит цену градиентом: распродажа, «цена что надо» и т. п.). */
  priceColor: string | null;
  badgeColor: string | null;
  badgeTextColor: string | null;
}

export interface ListingPage {
  items: ListingItem[];
  next: string | null;
}

const RATING_RE = /^\d[.,]\d$/;
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const hex = (v: unknown): string | null => (typeof v === 'string' && HEX_RE.test(v) ? v : null);

function states(json: unknown): Record<string, string> {
  const ws = (json as { widgetStates?: unknown } | null)?.widgetStates;
  if (!ws || typeof ws !== 'object') throw new Error('widgetStates not found');
  return ws as Record<string, string>;
}

function parseTile(t: any): ListingItem | null {
  const sku = t?.sku != null ? String(t.sku) : null;
  if (!sku || !/^\d+$/.test(sku)) return null;
  const main: any[] = Array.isArray(t.mainState) ? t.mainState : [];
  const price = main.find((m) => m.type === 'priceV2')?.priceV2?.price ?? [];
  const name = main.find((m) => m.id === 'name')?.textDS?.text ?? '';
  const labels: string[] = (main.find((m) => m.type === 'labelListV2')?.labelListV2?.items ?? [])
    .map((i: any) => i?.text?.text)
    .filter((x: unknown): x is string => typeof x === 'string');
  const images: string[] = (t.tileImage?.items ?? [])
    .filter((i: any) => i?.type === 'image')
    .map((i: any) => i.image?.link)
    .filter((l: unknown): l is string => typeof l === 'string' && l.startsWith('https://'));
  const cart = t.multiButton?.ozonButton?.addToCart;
  const fav = (t.topRightButtons ?? []).find((b: any) => b?.favoriteProductMoleculeV2)?.favoriteProductMoleculeV2;
  const stock = main.find((m) => m.type === 'textDS' && m.id !== 'name' && /осталось/.test(m.textDS?.text ?? ''));
  const priceV2 = main.find((m) => m.type === 'priceV2')?.priceV2;
  return {
    sku,
    // Ссылку собираем из SKU, а не берём из ответа.
    href: `https://www.ozon.ru/product/${sku}/`,
    title: String(name),
    image: images[0] ?? null,
    price: price.find((p: any) => p.textStyle === 'PRICE')?.text ?? price[0]?.text ?? null,
    oldPrice: price.find((p: any) => p.textStyle === 'ORIGINAL_PRICE')?.text ?? null,
    rating: labels.find((l) => RATING_RE.test(l)) ?? null,
    groupReviews: labels.map((l) => (RATING_RE.test(l) ? null : parseCount(l))).find((n) => n !== null) ?? null,
    images,
    badge: t.tileImage?.leftBottomBadgeV2?.text ?? null,
    stock: stock?.textDS?.text ?? null,
    discount: priceV2?.discount ?? null,
    cartTitle: cart?.actionButton?.title ?? null,
    inCart: Number(cart?.inCartQuantity ?? 0) || 0,
    isFav: Boolean(fav?.isFav),
    canBuy: Boolean(cart),
    priceColor: hex(priceV2?.priceStyle?.gradient?.startColor),
    badgeColor: hex(t.tileImage?.leftBottomBadgeV2?.customBadgeStyle?.backgroundColor?.color),
    badgeTextColor: hex(t.tileImage?.leftBottomBadgeV2?.customBadgeStyle?.textColor),
  };
}

/** Разбор страницы выдачи (поиск/категория) из entrypoint-api. */
export function parseListing(json: unknown): ListingPage {
  const ws = states(json);
  const items: ListingItem[] = [];
  let next: string | null = null;
  for (const [key, raw] of Object.entries(ws)) {
    if (key.startsWith('tileGridDesktop-')) {
      for (const t of JSON.parse(raw).items ?? []) {
        const item = parseTile(t);
        if (item) items.push(item);
      }
    } else if (key.startsWith('infiniteVirtualPaginator-')) {
      next = JSON.parse(raw).nextPage ?? null;
    }
  }
  const rootNext = (json as { nextPage?: unknown }).nextPage;
  if (!next && typeof rootNext === 'string') next = rootNext;
  return { items, next };
}

export async function fetchListing(path: string, fetchFn: typeof fetch = fetch): Promise<ListingPage> {
  return parseListing(await fetchEntrypoint(path, fetchFn));
}
