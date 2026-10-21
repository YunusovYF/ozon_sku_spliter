const SPACES = /[\s  ]+/g;
const COUNT_RE = /^\(?(\d+)\)?(?:отзыв[а-я]*)?$/;
const THIN_SPACE = ' ';

/** Число отзывов из текста Ozon: «16 873 отзыва», «93», «(1 234)». */
export function parseCount(text: string): number | null {
  const m = text.replace(SPACES, '').match(COUNT_RE);
  return m ? Number(m[1]) : null;
}

/** 16873 → «16 873» (тонкий пробел, как у Ozon). */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

export function formatLabel(variant: number, group: number): string {
  return `${formatCount(variant)} из ${formatCount(group)}`;
}

/** SKU — последнее число в сегменте после /product/. Только относительные ссылки или www.ozon.ru. */
export function extractSku(href: string): string | null {
  const m = href.match(/^(?:https:\/\/www\.ozon\.ru)?\/product\/(?:[^/?#]*?-)?(\d+)\/?(?:[?#]|$)/);
  return m ? m[1] : null;
}

/** «отзыв / отзыва / отзывов» по числу. */
export function reviewsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'отзыва';
  return 'отзывов';
}

/** Подпись отзывов на нашей карточке: «315 из 16 873» или «21 отзыв». */
export function reviewsLabel(variant: number | null, group: number | null): string {
  if (variant !== null) return formatLabel(variant, group ?? variant);
  if (group !== null) return `${formatCount(group)} ${reviewsWord(group)}`;
  return 'нет данных';
}
