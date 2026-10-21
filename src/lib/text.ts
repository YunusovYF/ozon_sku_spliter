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

/** SKU — последнее число в сегменте после /product/. */
export function extractSku(href: string): string | null {
  const m = href.match(/\/product\/(?:[^/?#]*?-)?(\d+)\/?(?:[?#]|$)/);
  return m ? m[1] : null;
}
