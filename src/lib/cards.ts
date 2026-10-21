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
    cards.push({ el, sku, href, title, reviewsEl: reviews.el, group: reviews.group });
  }
  return cards;
}

export function applyLabel(card: CardInfo, variant: number): void {
  const label = formatLabel(variant, card.group);
  card.reviewsEl.setAttribute(GROUP_ATTR, String(card.group));
  card.reviewsEl.setAttribute(LABEL_ATTR, label);
  if (card.reviewsEl.textContent !== label) card.reviewsEl.textContent = label;
}

/** true, если React Ozon перерисовал карточку и вернул исходный текст. */
export function isLabelStale(card: CardInfo): boolean {
  const label = card.reviewsEl.getAttribute(LABEL_ATTR);
  return label !== null && card.reviewsEl.textContent !== label;
}
