import { beforeEach, describe, expect, it, vi } from 'vitest';
import tileHtml from './fixtures/tile.html?raw';
import { TileFactory } from '../src/content/tiles';
import type { ViewEntry } from '../src/content/view';
import type { ListingItem } from '../src/lib/listing';

const item = (over: Partial<ListingItem> = {}): ListingItem => ({
  sku: '42',
  href: 'https://www.ozon.ru/product/42/',
  title: 'Новый товар',
  image: 'https://ir-17.ozone.ru/a.jpg',
  images: ['https://ir-17.ozone.ru/a.jpg', 'https://ir-17.ozone.ru/b.jpg', 'https://ir-17.ozone.ru/c.jpg'],
  price: '1 000 ₽',
  oldPrice: '2 000 ₽',
  discount: '−50%',
  rating: '4.7',
  groupReviews: 16873,
  badge: 'Вау-цены',
  stock: '5 ед осталось',
  cartTitle: 'Послезавтра',
  inCart: 0,
  isFav: false,
  canBuy: true,
  priceColor: '#F1117E',
  badgeColor: '#070707',
  badgeTextColor: '#FFFFFF',
  ...over,
});

const entry = (over: Partial<ListingItem> = {}, variant: number | null = 315): ViewEntry => ({
  item: item(over),
  variant,
  group: 16873,
});

const actions = () => ({
  cart: vi.fn(async (_sku: string, qty: number) => qty),
  favorite: vi.fn(async () => {}),
});

let factory: TileFactory;
beforeEach(() => {
  document.body.innerHTML = `<div data-widget="tileGridDesktop">${tileHtml}</div>`;
  factory = TileFactory.fromDocument(document)!;
});

const text = (el: Element) => (el.textContent ?? '').replace(/[ \n\t]+/g, ' ');

describe('TileFactory', () => {
  it('is created from a real Ozon card on the page', () => {
    expect(factory).not.toBeNull();
    expect(factory.grid().className).toBe('h4m_22');
  });

  it('waits until the template card has its icons rendered (Vue loads them async)', () => {
    const cartIcon = [...document.querySelectorAll('button')].find((b) => /Завтра/.test(b.textContent ?? ''))!.querySelector('svg')!;
    cartIcon.replaceWith(document.createComment(''));
    expect(TileFactory.fromDocument(document)).toBeNull();
  });

  it('waits for the reviews icon too, not just the rating star', () => {
    const reviews = [...document.querySelectorAll('span')].find((s) => /отзыв/.test(s.textContent ?? ''))!;
    reviews.previousElementSibling!.replaceWith(document.createComment(''));
    expect(TileFactory.fromDocument(document)).toBeNull();
  });

  it('does not carry our label attributes from the template', () => {
    const reviews = [...document.querySelectorAll('span')].find((s) => /отзыв/.test(s.textContent ?? ''))!;
    reviews.setAttribute('data-ozon-sku-label', '28 из 93');
    const t = TileFactory.fromDocument(document)!.build(entry(), actions());
    expect(t.querySelector('[data-ozon-sku-label]')).toBeNull();
  });

  it('returns null without cards', () => {
    document.body.innerHTML = '<div></div>';
    expect(TileFactory.fromDocument(document)).toBeNull();
  });

  it('fills the clone with item data and keeps Ozon classes', () => {
    const t = factory.build(entry(), actions());
    expect(t.classList.contains('tile-root')).toBe(true);
    expect(t.hasAttribute('data-index')).toBe(false);
    expect([...t.querySelectorAll('a')].every((a) => a.getAttribute('href') === 'https://www.ozon.ru/product/42/')).toBe(true);
    expect(t.querySelector('img')!.getAttribute('src')).toBe('https://ir-17.ozone.ru/a.jpg');
    expect(t.querySelector('img')!.hasAttribute('srcset')).toBe(false);
    const s = text(t);
    expect(s).toContain('1 000 ₽');
    expect(s).toContain('2 000 ₽');
    expect(s).toContain('−50%');
    expect(s).toContain('Вау-цены');
    expect(s).toContain('5 ед осталось');
    expect(s).toContain('Новый товар');
    expect(s).toContain('4.7');
    expect(s).toContain('315 из 16 873');
    expect(s).toContain('Послезавтра');
    expect(s).not.toContain('Сетевой фильтр');
    expect(s).not.toContain('631 ед осталось');
  });

  it('removes parts the item does not have', () => {
    const t = factory.build(
      entry({ oldPrice: null, discount: null, badge: null, stock: null, rating: null, images: ['https://ir-17.ozone.ru/a.jpg'] }, null),
      actions(),
    );
    const s = text(t);
    expect(s).not.toContain('7 304 ₽');
    expect(s).not.toContain('−59%');
    expect(s).not.toContain('Распродажа');
    expect(s).not.toContain('осталось');
    expect(s).not.toContain('4.9');
    expect(s).toContain('16 873 отзыва');
    expect(t.querySelector('section')).toBeNull();
    expect(t.querySelectorAll('a img ~ button')).toHaveLength(0);
  });

  it('gallery arrows switch photos without navigating', () => {
    const t = factory.build(entry(), actions());
    const next = t.querySelectorAll<HTMLButtonElement>('a button')[1];
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    next.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(t.querySelector('img')!.getAttribute('src')).toBe('https://ir-17.ozone.ru/b.jpg');
    const dots = t.querySelector('a')!.querySelectorAll(':scope > div > span');
    expect(dots).toHaveLength(3);
    expect(dots[1].className).toBe('sg_22 gs0_22');
    expect(dots[0].className).toBe('sg_22');
  });

  it('cart button turns into a quantity stepper like Ozon', async () => {
    const a = actions();
    const t = factory.build(entry(), a);
    const btn = [...t.querySelectorAll('button')].find((b) => text(b).includes('Послезавтра'))!;
    btn.click();
    const stepper = () => t.querySelector<HTMLElement>('[data-ozon-sku-stepper]');
    await vi.waitFor(() => expect(stepper()).not.toBeNull());
    expect(a.cart).toHaveBeenCalledWith('42', 1);
    expect(btn.style.display).toBe('none');
    expect(stepper()!.querySelector('[data-qty]')!.textContent).toBe('1');
    stepper()!.querySelector<HTMLButtonElement>('[data-plus]')!.click();
    await vi.waitFor(() => expect(stepper()!.querySelector('[data-qty]')!.textContent).toBe('2'));
    expect(a.cart).toHaveBeenLastCalledWith('42', 2);
    stepper()!.querySelector<HTMLButtonElement>('[data-minus]')!.click();
    stepper()!.querySelector<HTMLButtonElement>('[data-minus]')!.click();
    await vi.waitFor(() => expect(btn.style.display).toBe(''));
    expect(stepper()!.style.display).toBe('none');
    expect(a.cart).toHaveBeenLastCalledWith('42', 0);
  });

  it('starts with the stepper when the item is already in the cart', () => {
    const t = factory.build(entry({ inCart: 3 }), actions());
    expect(t.querySelector('[data-ozon-sku-stepper] [data-qty]')!.textContent).toBe('3');
  });

  it('heart toggles favorite', async () => {
    const a = actions();
    const t = factory.build(entry(), a);
    const heart = t.querySelector<HTMLButtonElement>('[data-ozon-sku-fav]')!;
    heart.click();
    await vi.waitFor(() => expect(heart.getAttribute('data-ozon-sku-fav')).toBe('on'));
    expect(a.favorite).toHaveBeenCalledWith('42', true);
    heart.click();
    await vi.waitFor(() => expect(heart.getAttribute('data-ozon-sku-fav')).toBe('off'));
    expect(a.favorite).toHaveBeenLastCalledWith('42', false);
  });

  it('drops template-only parts: brand logo, brand line, seller mark', () => {
    // Шаблоном стала карточка товара Ozon: логотип бренда, строка бренда и метка «Ozon».
    const card = document.querySelector<HTMLElement>('[data-index]')!;
    const info = card.querySelector('a')!.nextElementSibling as HTMLElement;
    const brandLine = document.createElement('div');
    brandLine.innerHTML = '<span class="tsBodyControl400Small">AGNI</span>';
    info.firstElementChild!.after(brandLine);
    const ratingRow = [...card.querySelectorAll('span')].find((s) => s.textContent === '4.9')!.parentElement!;
    ratingRow.insertAdjacentHTML('beforeend', '<svg></svg><span class="tsBodyControl300XSmall">Ozon</span>');
    card.insertAdjacentHTML('beforeend', '<a href="/brand/agni/"><div><img src="https://cdn1.ozonusercontent.com/logo.jpg"></div></a>');
    const f = TileFactory.fromDocument(document)!;
    const t = f.build(entry(), actions());
    const s = text(t);
    expect(s).not.toContain('AGNI');
    expect(s).not.toContain('Ozon');
    expect(t.querySelectorAll('img')).toHaveLength(1);
  });

  it('colors the price from item data', () => {
    const t = factory.build(entry({ priceColor: '#10C44C' }), actions());
    const price = [...t.querySelectorAll<HTMLElement>('span')].find((s) => s.textContent === '1 000 ₽')!;
    expect(price.style.color).toBe('rgb(16, 196, 76)');
    expect(price.style.backgroundImage).toBe('none');
  });

  it('shows a short error on the cart button when Ozon refuses', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = actions();
    a.cart.mockRejectedValueOnce(new Error('HTTP 403'));
    const t = factory.build(entry(), a);
    const btn = [...t.querySelectorAll('button')].find((b) => text(b).includes('Послезавтра'))!;
    btn.click();
    await vi.waitFor(() => expect(text(btn)).toContain('Не получилось'));
    expect(btn.style.display).toBe('');
    expect(t.querySelector<HTMLElement>('[data-ozon-sku-stepper]')!.style.display).toBe('none');
  });

  it('remembers cart and favorite state in the item', async () => {
    const a = actions();
    const e = entry();
    const t = factory.build(e, a);
    [...t.querySelectorAll('button')].find((b) => text(b).includes('Послезавтра'))!.click();
    t.querySelector<HTMLButtonElement>('[data-ozon-sku-fav]')!.click();
    await vi.waitFor(() => expect(e.item.inCart).toBe(1));
    await vi.waitFor(() => expect(e.item.isFav).toBe(true));
    const again = factory.build(e, a);
    expect(again.querySelector('[data-ozon-sku-stepper] [data-qty]')!.textContent).toBe('1');
    expect(again.querySelector('[data-ozon-sku-fav]')!.getAttribute('data-ozon-sku-fav')).toBe('on');
  });

  it('drops unknown template prices, marketing icons and image overlays', () => {
    const card = document.querySelector<HTMLElement>('[data-index]')!;
    const priceRow = [...card.querySelectorAll('span')].find((s) => /tsHeadline/.test(s.className))!.parentElement!;
    priceRow.insertAdjacentHTML('beforeend', '<span class="card-price">2 800 ₽ с Ozon Картой</span>');
    card.querySelector('a')!.insertAdjacentHTML('beforeend', '<div class="overlay">Только у нас</div>');
    const f = TileFactory.fromDocument(document)!;
    const t = f.build(entry(), actions());
    const s = text(t);
    expect(s).not.toContain('2 800 ₽');
    expect(s).not.toContain('Только у нас');
    const cart = [...t.querySelectorAll('button')].find((b) => text(b).includes('Послезавтра'))!;
    const siblings = [...cart.parentElement!.children].filter((c) => c !== cart && !c.hasAttribute('data-ozon-sku-stepper'));
    expect(siblings).toHaveLength(0);
  });

  it('paints the badge with the item colors and drops the template icon', () => {
    const t = factory.build(entry(), actions());
    const label = [...t.querySelectorAll<HTMLElement>('section *')].find((e) => e.textContent === 'Вау-цены')!;
    const box = t.querySelector<HTMLElement>('section > div')!;
    expect(box.style.background).toContain('rgb(7, 7, 7)');
    expect(box.style.color).toBe('rgb(255, 255, 255)');
    expect(t.querySelector('section svg')).toBeNull();
    expect(label).toBeTruthy();
  });

  it('has no cart button for items that cannot be bought', () => {
    const t = factory.build(entry({ canBuy: false, cartTitle: null }), actions());
    expect([...t.querySelectorAll('button')].some((b) => /Послезавтра|В корзину|Завтра/.test(text(b)))).toBe(false);
    expect(t.querySelector('[data-ozon-sku-stepper]')).toBeNull();
  });
});
