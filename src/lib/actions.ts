// Действия, которые делают кнопки карточки Ozon: корзина и избранное (те же запросы, что шлёт сайт).
const ACTION_URL = 'https://www.ozon.ru/api/composer-api.bx/_action/';

async function post(path: string, body: unknown, fetchFn: typeof fetch): Promise<any> {
  const res = await fetchFn(ACTION_URL + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

export interface CartState {
  /** Сколько этого товара в корзине. */
  quantity: number;
  /** Сколько всего штук в корзине (для бейджа в шапке). */
  total: number;
}

/** Ставит общее количество товара в корзине (0 — убрать). */
export async function setCartQuantity(sku: string, quantity: number, fetchFn: typeof fetch = fetch): Promise<CartState> {
  const json = await post('v2/addToCart', [{ id: Number(sku), quantity, selectedDeliverySchema: 0 }], fetchFn);
  if (!json?.data?.success) throw new Error('addToCart failed');
  const items: { id: number; qty: number }[] = json.data.cart?.cartItems ?? [];
  return {
    quantity: items.find((i) => String(i.id) === sku)?.qty ?? 0,
    total: items.reduce((n, i) => n + (i.qty || 0), 0),
  };
}

export async function setFavorite(sku: string, on: boolean, fetchFn: typeof fetch = fetch): Promise<void> {
  await post(on ? 'v2/favoriteBatchAddItems' : 'v2/favoriteBatchDeleteItems', { skus: [Number(sku)] }, fetchFn);
}
