import { extractSku, formatLabel, parseCount } from './text';

export interface CardInfo {
  el: HTMLElement;
  sku: string;
  href: string;
  title: string;
  reviewsEl: HTMLElement;
  group: number;
}

const LABEL_ATTR = 'data-ozon-sku-label';
const GROUP_ATTR = 'data-ozon-sku-group';
const ORIG_ATTR = 'data-ozon-sku-orig';
const RATING_RE = /^\d[.,]\d$/;

/** Ищет span с числом отзывов рядом со span рейтинга («4.9»). Классы Ozon обфусцированы — опираемся на текст. */
function findReviews(card: HTMLElement): { el: HTMLElement; group: number } | null {
  for (const rating of card.querySelectorAll('span')) {
    if (rating.childElementCount || !RATING_RE.test(rating.textContent?.trim() ?? '')) continue;
    for (const el of rating.parentElement?.querySelectorAll<HTMLElement>(':scope > span') ?? []) {
      if (el === rating || el.childElementCount) continue;
      // Свежий текст Ozon важнее сохранённого: React может переиспользовать узел под другой товар.
      const text = el.textContent ?? '';
      const fromText = parseCount(text);
      const group =
        fromText ?? (text === el.getAttribute(LABEL_ATTR) ? Number(el.getAttribute(GROUP_ATTR)) : null);
      if (group !== null) return { el, group };
    }
  }
  return null;
}

export function findCards(root: ParentNode): CardInfo[] {
  const cards: CardInfo[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-index]')) {
    const links = [...el.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]')];
    const href = links[0]?.getAttribute('href');
    const sku = href ? extractSku(href) : null;
    if (!href || !sku) continue;
    const reviews = findReviews(el);
    if (!reviews) continue;
    const title = links
      .map((a) => (a.textContent ?? '').trim())
      .reduce((a, b) => (b.length > a.length ? b : a), '');
    // Ссылку собираем из SKU, а не копируем со страницы.
    cards.push({ el, sku, href: `https://www.ozon.ru/product/${sku}/`, title, reviewsEl: reviews.el, group: reviews.group });
  }
  return cards;
}

export function applyLabel(card: CardInfo, variant: number): void {
  const label = formatLabel(variant, card.group);
  const text = card.reviewsEl.textContent ?? '';
  if (!card.reviewsEl.hasAttribute(ORIG_ATTR) || parseCount(text) !== null) card.reviewsEl.setAttribute(ORIG_ATTR, text);
  card.reviewsEl.setAttribute(GROUP_ATTR, String(card.group));
  card.reviewsEl.setAttribute(LABEL_ATTR, label);
  if (card.reviewsEl.textContent !== label) card.reviewsEl.textContent = label;
}

/** Возвращает исходный текст Ozon и снимает наши атрибуты. */
export function removeLabel(card: CardInfo): void {
  const el = card.reviewsEl;
  const orig = el.getAttribute(ORIG_ATTR);
  if (orig !== null && el.textContent === el.getAttribute(LABEL_ATTR)) el.textContent = orig;
  for (const a of [ORIG_ATTR, LABEL_ATTR, GROUP_ATTR]) el.removeAttribute(a);
}

/** true, если React Ozon перерисовал карточку и вернул исходный текст. */
export function isLabelStale(card: CardInfo): boolean {
  const label = card.reviewsEl.getAttribute(LABEL_ATTR);
  return label !== null && card.reviewsEl.textContent !== label;
}
