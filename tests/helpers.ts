// Фабрики ответов API выдачи Ozon для тестов.

export function tile(sku: number, opts: { title?: string; reviews?: string; rating?: string; price?: string } = {}) {
  return {
    sku,
    action: { link: `/product/item-${sku}/?at=x` },
    tileImage: {
      items: [
        { type: 'image', image: { link: `https://ir-17.ozone.ru/s3/${sku}.jpg` } },
        { type: 'video', video: {} },
        { type: 'image', image: { link: `https://ir-17.ozone.ru/s3/${sku}-2.jpg` } },
      ],
      leftBottomBadgeV2: {
        text: 'Распродажа',
        customBadgeStyle: { backgroundColor: { color: '#F1117E' }, textColor: '#FFFFFF' },
      },
    },
    multiButton: {
      ozonButton: { type: 'addToCart', addToCart: { skuId: String(sku), actionButton: { title: 'Завтра' }, inCartQuantity: 0 } },
    },
    topRightButtons: [{ type: 'favoriteProductMoleculeV2', favoriteProductMoleculeV2: { id: String(sku), isFav: false } }],
    mainState: [
      {
        type: 'priceV2',
        priceV2: {
          price: [{ text: opts.price ?? '3 012 ₽', textStyle: 'PRICE' }, { text: '7 958 ₽', textStyle: 'ORIGINAL_PRICE' }],
          discount: '−62%',
          priceStyle: { gradient: { startColor: '#F1117E', endColor: '#F1117E' } },
        },
      },
      { type: 'textDS', textDS: { text: '89 ед осталось' } },
      { type: 'textDS', id: 'name', textDS: { text: opts.title ?? `Товар ${sku}` } },
      {
        type: 'labelListV2',
        labelListV2: {
          items: [
            { type: 'icon', icon: {} },
            { type: 'text', text: { text: opts.rating ?? '4.9' } },
            { type: 'icon', icon: {} },
            { type: 'text', text: { text: opts.reviews ?? '2 473 отзыва' } },
          ],
        },
      },
    ],
  };
}

export function listingPage(skus: number[], next: string | null, firstPage = false) {
  const widgetStates: Record<string, string> = {
    'tileGridDesktop-1-default-1': JSON.stringify({ items: skus.map((s) => tile(s)) }),
  };
  if (firstPage) widgetStates['infiniteVirtualPaginator-1-default-1'] = JSON.stringify({ nextPage: next });
  return firstPage ? { widgetStates } : { widgetStates, nextPage: next };
}
