import { describe, expect, it, vi } from 'vitest';
import { setCartQuantity, setFavorite } from '../src/lib/actions';

const ok = (body: unknown) =>
  vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));

describe('setCartQuantity', () => {
  it('posts the total quantity and returns item and cart totals', async () => {
    const f = ok({ data: { success: true, cart: { cartItems: [{ id: 42, qty: 2 }, { id: 7, qty: 1 }] } } });
    expect(await setCartQuantity('42', 2, f as unknown as typeof fetch)).toEqual({ quantity: 2, total: 3 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://www.ozon.ru/api/composer-api.bx/_action/v2/addToCart');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual([{ id: 42, quantity: 2, selectedDeliverySchema: 0 }]);
  });
  it('returns 0 when the item is not in the cart anymore', async () => {
    const f = ok({ data: { success: true, cart: { cartItems: [] } } });
    expect(await setCartQuantity('42', 0, f as unknown as typeof fetch)).toEqual({ quantity: 0, total: 0 });
  });
  it('throws when Ozon reports failure', async () => {
    const f = ok({ data: { success: false } });
    await expect(setCartQuantity('42', 1, f as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe('setFavorite', () => {
  it('posts to add or delete endpoint', async () => {
    const f = ok({ data: {} });
    await setFavorite('42', true, f as unknown as typeof fetch);
    await setFavorite('42', false, f as unknown as typeof fetch);
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://www.ozon.ru/api/composer-api.bx/_action/v2/favoriteBatchAddItems',
      'https://www.ozon.ru/api/composer-api.bx/_action/v2/favoriteBatchDeleteItems',
    ]);
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({ skus: [42] });
  });
});
