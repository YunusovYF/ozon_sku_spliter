import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SortedView, type ViewEntry } from '../src/content/view';
import type { ListingItem } from '../src/lib/listing';

const item = (sku: string): ListingItem => ({
  sku,
  href: `https://www.ozon.ru/product/${sku}/`,
  title: `Товар ${sku}`,
  image: `https://ir-17.ozone.ru/${sku}.jpg`,
  price: '1 000 ₽',
  oldPrice: null,
  rating: '4.9',
  groupReviews: 16873,
  images: [`https://ir-17.ozone.ru/${sku}.jpg`],
  badge: null,
  stock: null,
  discount: null,
  cartTitle: 'Завтра',
  inCart: 0,
  isFav: false,
  canBuy: true,
  priceColor: null,
  badgeColor: null,
  badgeTextColor: null,
});

let anchor: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<main><div id="ozon" style="color: red;">ozon grid</div></main>';
  anchor = document.getElementById('ozon')!;
});

const cards = (v: SortedView) => [...v.root.querySelectorAll('a.card')];

describe('SortedView', () => {
  it('show hides the Ozon grid and inserts the view before it; hide restores', () => {
    const v = new SortedView(anchor);
    v.show();
    expect(anchor.style.display).toBe('none');
    expect(anchor.previousElementSibling).toBe(v.root);
    v.hide();
    expect(anchor.getAttribute('style')).toBe('color: red;');
    expect(document.querySelector('[data-ozon-sku-view]')).toBeNull();
  });

  it('renders cards in the given order with real review labels', () => {
    const v = new SortedView(anchor);
    v.show();
    const entries: ViewEntry[] = [
      { item: item('2'), variant: 315, group: 16873 },
      { item: item('1'), variant: null, group: 21 },
      { item: item('3'), variant: null, group: null },
    ];
    v.render(entries, 'Шапка');
    const c = cards(v);
    expect(c.map((a) => a.getAttribute('href'))).toEqual([
      'https://www.ozon.ru/product/2/',
      'https://www.ozon.ru/product/1/',
      'https://www.ozon.ru/product/3/',
    ]);
    expect(c[0].textContent).toContain('315 из 16 873');
    expect(c[1].textContent).toContain('21 отзыв');
    expect(c[0].querySelector('img')!.getAttribute('src')).toBe('https://ir-17.ozone.ru/2.jpg');
    expect(v.root.textContent).toContain('Шапка');
  });

  it('does not re-render identical content (keeps link under cursor)', () => {
    const v = new SortedView(anchor);
    v.show();
    const entries: ViewEntry[] = [{ item: item('1'), variant: 1, group: 2 }];
    v.render(entries, 'h');
    const first = cards(v)[0];
    v.render([...entries], 'h');
    expect(cards(v)[0]).toBe(first);
  });

  it('shows a load-more button that calls back', () => {
    const v = new SortedView(anchor);
    v.show();
    const more = vi.fn();
    v.render([], 'h', { label: 'Загрузить ещё', onClick: more });
    const btn = [...v.root.querySelectorAll('button')].find((b) => b.textContent === 'Загрузить ещё')!;
    btn.click();
    expect(more).toHaveBeenCalledOnce();
  });

  it('reuses card nodes across renders: reorders instead of rebuilding', () => {
    const v = new SortedView(anchor);
    v.show();
    v.render([{ item: item('1'), variant: 5, group: 9 }, { item: item('2'), variant: 3, group: 9 }], 'h1');
    const [c1, c2] = cards(v);
    v.render([{ item: item('2'), variant: 3, group: 9 }, { item: item('1'), variant: 5, group: 9 }], 'h2');
    expect(cards(v)).toEqual([c2, c1]);
    expect(v.root.textContent).toContain('h2');
    v.render([{ item: item('2'), variant: 4, group: 9 }, { item: item('1'), variant: 5, group: 9 }], 'h2');
    expect(cards(v)[0]).not.toBe(c2);
    expect(cards(v)[1]).toBe(c1);
  });

  it('hide restores only the display property, keeping later Ozon style changes', () => {
    const v = new SortedView(anchor);
    v.show();
    anchor.style.minHeight = '9000px'; // Ozon поменял высоту, пока сетка была скрыта
    v.hide();
    expect(anchor.style.display).toBe('');
    expect(anchor.style.minHeight).toBe('9000px');
    expect(anchor.style.color).toBe('red');
  });
});
