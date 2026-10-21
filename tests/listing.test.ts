import { describe, expect, it, vi } from 'vitest';
import { BlockedError } from '../src/lib/api';
import { fetchListing, parseListing } from '../src/lib/listing';
import { listingPage, tile } from './helpers';

describe('parseListing', () => {
  it('extracts card data', () => {
    const { items } = parseListing({
      widgetStates: { 'tileGridDesktop-1-default-1': JSON.stringify({ items: [tile(1838232208, { title: 'Фильтр' })] }) },
    });
    expect(items).toEqual([
      {
        sku: '1838232208',
        href: 'https://www.ozon.ru/product/1838232208/',
        title: 'Фильтр',
        image: 'https://ir-17.ozone.ru/s3/1838232208.jpg',
        price: '3 012 ₽',
        oldPrice: '7 958 ₽',
        rating: '4.9',
        groupReviews: 2473,
        images: ['https://ir-17.ozone.ru/s3/1838232208.jpg', 'https://ir-17.ozone.ru/s3/1838232208-2.jpg'],
        badge: 'Распродажа',
        stock: '89 ед осталось',
        discount: '−62%',
        cartTitle: 'Завтра',
        inCart: 0,
        isFav: false,
        canBuy: true,
        priceColor: '#F1117E',
        badgeColor: '#F1117E',
        badgeTextColor: '#FFFFFF',
      },
    ]);
  });

  it('takes next page from the paginator widget on the first page', () => {
    expect(parseListing(listingPage([1], '/cat/?page=2', true)).next).toBe('/cat/?page=2');
  });

  it('takes next page from the root on later pages', () => {
    expect(parseListing(listingPage([1], '/cat/?page=3')).next).toBe('/cat/?page=3');
  });

  it('collects items from several grid widgets', () => {
    const json = {
      widgetStates: {
        'tileGridDesktop-1-default-1': JSON.stringify({ items: [tile(1)] }),
        'tileGridDesktop-2-default-1': JSON.stringify({ items: [tile(2)] }),
      },
    };
    expect(parseListing(json).items.map((i) => i.sku)).toEqual(['1', '2']);
  });

  it('drops non-https images', () => {
    const t = tile(5);
    t.tileImage.items[0].image!.link = 'javascript:alert(1)';
    const json = { widgetStates: { 'tileGridDesktop-1-default-1': JSON.stringify({ items: [t] }) } };
    expect(parseListing(json).items[0].image).toBe('https://ir-17.ozone.ru/s3/5-2.jpg');
    expect(parseListing(json).items[0].images).toEqual(['https://ir-17.ozone.ru/s3/5-2.jpg']);
  });
});

describe('fetchListing', () => {
  it('requests the page through the entrypoint api', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) =>
      new Response(JSON.stringify(listingPage([1], null)), { headers: { 'content-type': 'application/json' } }),
    );
    await fetchListing('/cat/?page=2', f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toBe('https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fcat%2F%3Fpage%3D2');
  });

  it('treats html as blocked', async () => {
    const f = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    await expect(fetchListing('/cat/', f as unknown as typeof fetch)).rejects.toBeInstanceOf(BlockedError);
  });

  it('marks items without an add-to-cart button as not buyable', () => {
    const t = tile(9) as Record<string, unknown>;
    delete t.multiButton;
    const json = { widgetStates: { 'tileGridDesktop-1-default-1': JSON.stringify({ items: [t] }) } };
    expect(parseListing(json).items[0].canBuy).toBe(false);
  });
});
