import type { ListingItem } from '../lib/listing';
import { reviewsLabel } from '../lib/text';
import type { ViewEntry } from './view';

const CARD_SELECTOR = '[data-widget="tileGridDesktop"] [data-index]';
const RATING_RE = /^\d[.,]\d$/;
const FAV_ATTR = 'data-ozon-sku-fav';
const FAIL_TEXT = 'Не получилось';
const FAIL_MS = 2500;
const FILLED_HEART =
  'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z';

export interface TileActions {
  /** Ставит количество в корзине, возвращает фактическое. */
  cart(sku: string, quantity: number): Promise<number>;
  favorite(sku: string, on: boolean): Promise<void>;
}

/** Части карточки Ozon, найденные по смыслу, а не по хэшированным классам. */
interface Parts {
  imageLink: HTMLAnchorElement;
  img: HTMLImageElement;
  arrows: HTMLButtonElement[];
  badge: HTMLElement | null;
  dots: HTMLElement | null;
  price: HTMLElement;
  oldPrice: HTMLElement | null;
  discount: HTMLElement | null;
  stock: HTMLElement | null;
  title: HTMLElement;
  rating: HTMLElement | null;
  reviews: HTMLElement;
  cart: HTMLButtonElement;
  cartLabel: HTMLElement;
  heart: HTMLButtonElement | null;
}

const ownText = (el: Element) =>
  [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('')
    .trim();

const leaves = (root: Element) => [...root.querySelectorAll<HTMLElement>('*')].filter((e) => !e.childElementCount);

function findParts(card: HTMLElement): Parts | null {
  const links = [...card.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]')];
  const imageLink = links.find((a) => a.querySelector('img'));
  const img = imageLink?.querySelector('img');
  if (!imageLink || !img) return null;

  const spans = [...card.querySelectorAll<HTMLElement>('span')];
  const price = spans.find((s) => /tsHeadline/.test(s.className) && /₽/.test(s.textContent ?? ''));
  const oldPrice = spans.find((s) => s !== price && !s.closest('a') && s.querySelector('span') && /₽/.test(s.textContent ?? '')) ?? null;
  const discount = spans.find((s) => /^[−-]\d+%$/.test(ownText(s))) ?? null;
  const stockSpan = spans.find((s) => /осталось/.test(s.textContent ?? '') && !s.childElementCount);
  const titleLink = links.find((a) => a !== imageLink);
  const title = titleLink ? leaves(titleLink).find((e) => (e.textContent ?? '').trim()) : undefined;
  const rating = spans.find((s) => RATING_RE.test((s.textContent ?? '').trim())) ?? null;
  const reviews = rating?.parentElement
    ? [...rating.parentElement.querySelectorAll<HTMLElement>(':scope > span')].find((s) => s !== rating)
    : undefined;
  const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !imageLink.contains(b));
  const cart = buttons.find((b) => (b.textContent ?? '').trim());
  const cartLabel = cart ? leaves(cart).find((e) => (e.textContent ?? '').trim()) : undefined;
  if (!price || !title || !reviews || !cart || !cartLabel) return null;

  const dots = [...imageLink.querySelectorAll<HTMLElement>('div')].find(
    (d) => d.childElementCount >= 2 && [...d.children].every((c) => c.tagName === 'SPAN' && !c.childElementCount),
  );
  return {
    imageLink,
    img,
    arrows: [...imageLink.querySelectorAll<HTMLButtonElement>('button')],
    badge: imageLink.querySelector('section'),
    dots: dots ?? null,
    price,
    oldPrice,
    discount,
    stock: stockSpan?.parentElement ?? null,
    title,
    rating,
    reviews,
    cart,
    cartLabel,
    heart: buttons.filter((b) => b !== cart).pop() ?? null,
  };
}

/**
 * Убирает то, что относится к конкретному товару-шаблону: логотип бренда, строку бренда,
 * метку продавца после отзывов. Остаются только части, которые мы заполняем сами.
 */
function stripTemplateExtras(tile: HTMLElement, p: Parts): void {
  for (const a of tile.querySelectorAll('a')) if (a !== p.imageLink && a.querySelector('img')) a.remove();

  const info = [...tile.children].find((c) => c.contains(p.price));
  if (info) {
    const known = [p.price, p.stock, p.title, p.reviews, p.cart].filter((x): x is HTMLElement => !!x);
    for (const block of [...info.children]) if (!known.some((k) => block.contains(k))) block.remove();
  }

  // В блоке фото — только картинка (со стрелками), бейдж и точки галереи.
  const imgBox = p.img.parentElement;
  for (const child of [...p.imageLink.children]) {
    if (child !== imgBox && child !== p.badge && child !== p.dots) child.remove();
  }

  // В блоке цены — только опознанные цена, старая цена и скидка (например, «цена с Ozon Картой» убираем).
  const priceRow = p.price.parentElement;
  if (priceRow) {
    for (const child of [...priceRow.children]) {
      if (child !== p.price && child !== p.oldPrice && child !== p.discount) child.remove();
    }
  }

  // Рядом с кнопкой корзины у шаблона бывают значки продавца — они про другой товар.
  for (const sib of [...(p.cart.parentElement?.children ?? [])]) if (sib !== p.cart) sib.remove();

  let extra = p.reviews.nextSibling;
  while (extra) {
    const next = extra.nextSibling;
    extra.remove();
    extra = next;
  }
}

const MINUS_PATH = 'M5 11h14v2H5z';
const PLUS_PATH = 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z';

function icon(d: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/** Счётчик количества: размеры берём у кнопки корзины Ozon (её классы), цвета — светлые, как у Ozon. */
function buildStepper(cart: HTMLButtonElement) {
  const el = document.createElement('div');
  el.className = cart.className;
  el.setAttribute('data-ozon-sku-stepper', '');
  el.style.cssText =
    'display: none; align-items: center; justify-content: space-between; padding: 0 4px; cursor: default;' +
    'background: var(--bgActionSecondary, #e8f0ff); color: var(--textAction, #005bff);';
  const btn = (d: string, attr: string, label: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute(attr, '');
    b.setAttribute('aria-label', label);
    b.style.cssText = 'all: unset; display: flex; padding: 8px; cursor: pointer; color: inherit;';
    b.append(icon(d));
    return b;
  };
  const minus = btn(MINUS_PATH, 'data-minus', 'Убрать одну');
  const plus = btn(PLUS_PATH, 'data-plus', 'Добавить ещё');
  const qty = document.createElement('span');
  qty.setAttribute('data-qty', '');
  qty.className = 'tsBodyControl500Medium';
  qty.style.color = 'var(--textPrimary, #070707)';
  el.append(minus, qty, plus);
  return { el, minus, plus, qty };
}

/** Vue дорисовывает иконки асинхронно: пока на их месте комментарии, карточка для шаблона не годится. */
function isRendered(p: Parts): boolean {
  return !!p.cart.querySelector('svg') && p.reviews.previousElementSibling?.tagName.toLowerCase() === 'svg';
}

function setOwnText(el: HTMLElement, text: string): void {
  const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
  if (node) node.textContent = text;
  else el.append(text);
}

function stop(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

/** Делает карточки «как у Ozon» из клона настоящей карточки со страницы. */
export class TileFactory {
  private constructor(
    private template: HTMLElement,
    private gridClass: string,
  ) {}

  static fromDocument(root: Document): TileFactory | null {
    for (const card of root.querySelectorAll<HTMLElement>(CARD_SELECTOR)) {
      const p = findParts(card);
      if (p && isRendered(p)) {
        const template = card.cloneNode(true) as HTMLElement;
        // Наши служебные атрибуты (подписи v0.1 на карточках Ozon) в шаблон не берём.
        for (const el of template.querySelectorAll('*')) {
          for (const a of [...el.attributes]) if (a.name.startsWith('data-ozon-sku')) el.removeAttribute(a.name);
        }
        return new TileFactory(template, card.parentElement?.className ?? '');
      }
    }
    return null;
  }

  /** Контейнер сетки с классами Ozon. */
  grid(): HTMLElement {
    const g = document.createElement('div');
    g.className = this.gridClass;
    return g;
  }

  build(entry: ViewEntry, actions: TileActions): HTMLElement {
    const { item } = entry;
    const tile = this.template.cloneNode(true) as HTMLElement;
    for (const a of [...tile.attributes]) if (a.name.startsWith('data-')) tile.removeAttribute(a.name);
    tile.setAttribute('data-ozon-sku-tile', item.sku);
    const p = findParts(tile)!;
    stripTemplateExtras(tile, p);

    for (const a of tile.querySelectorAll<HTMLAnchorElement>('a')) {
      a.href = item.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.removeAttribute('data-prerender');
    }

    this.fillGallery(p, item.images.length ? item.images : item.image ? [item.image] : []);

    if (item.badge && p.badge) {
      const label = leaves(p.badge).find((e) => (e.textContent ?? '').trim());
      if (label) {
        label.textContent = item.badge;
        label.setAttribute('title', item.badge);
      }
      // Иконка и цвета — от товара-шаблона: иконку убираем, цвета берём из данных товара.
      p.badge.querySelectorAll('svg').forEach((svg) => svg.remove());
      const box = p.badge.firstElementChild as HTMLElement | null;
      if (box) {
        box.style.setProperty('background', item.badgeColor ?? 'var(--bgAccentPrimary, #f1117e)');
        box.style.setProperty('color', item.badgeTextColor ?? '#fff');
      }
    } else p.badge?.remove();

    p.price.textContent = item.price ?? '';
    // Ozon красит цену градиентом через background-clip: text, но этот класс есть не у каждого шаблона —
    // поэтому задаём цвет напрямую и убираем фон.
    const color = item.priceColor ?? 'var(--textPrimary, #070707)';
    p.price.style.setProperty('background-image', 'none');
    p.price.style.setProperty('color', color);
    p.price.style.setProperty('-webkit-text-fill-color', color);
    if (item.oldPrice && p.oldPrice) {
      for (const s of p.oldPrice.querySelectorAll('span span, span')) if (!s.childElementCount) s.textContent = item.oldPrice;
    } else p.oldPrice?.remove();
    if (item.discount && item.oldPrice && p.discount) setOwnText(p.discount, item.discount);
    else p.discount?.remove();

    if (item.stock && p.stock) p.stock.textContent = item.stock;
    else p.stock?.remove();

    p.title.textContent = item.title;

    if (item.rating && p.rating) p.rating.textContent = item.rating;
    else if (p.rating) {
      const icon = p.rating.previousElementSibling;
      if (icon?.tagName.toLowerCase() === 'svg') icon.remove();
      p.rating.remove();
    }
    p.reviews.textContent = reviewsLabel(entry.variant, entry.group);

    if (item.canBuy) this.bindCart(p, item, actions);
    else p.cart.remove();
    if (p.heart) this.bindHeart(p.heart, item, actions);
    return tile;
  }

  private fillGallery(p: Parts, images: string[]): void {
    p.img.removeAttribute('srcset');
    p.img.removeAttribute('fetchpriority');
    p.img.loading = 'lazy';
    p.img.src = images[0] ?? '';
    if (images.length <= 1) {
      p.arrows.forEach((b) => b.remove());
      p.dots?.remove();
      return;
    }

    const dots = p.dots ? [...p.dots.children] as HTMLElement[] : [];
    const plain = dots[1]?.className ?? '';
    const active = dots[0]?.className ?? '';
    const count = Math.min(images.length, Math.max(dots.length, 1));
    if (p.dots) {
      const proto = dots[1] ?? dots[0];
      p.dots.replaceChildren(...images.slice(0, count).map(() => proto.cloneNode() as HTMLElement));
    }
    let index = 0;
    const show = (i: number) => {
      index = (i + images.length) % images.length;
      p.img.src = images[index];
      if (p.dots) [...p.dots.children].forEach((d, k) => (d.className = k === Math.min(index, count - 1) ? active : plain));
    };
    show(0);

    const [prev, next] = p.arrows;
    prev?.addEventListener('click', (e) => (stop(e), show(index - 1)));
    next?.addEventListener('click', (e) => (stop(e), show(index + 1)));
    // Как у Ozon: фото переключается при движении мыши по картинке.
    const area = p.img.parentElement ?? p.img;
    area.addEventListener('mousemove', (e) => {
      const r = area.getBoundingClientRect();
      if (r.width) show(Math.min(images.length - 1, Math.floor(((e.clientX - r.left) / r.width) * images.length)));
    });
    area.addEventListener('mouseleave', () => show(0));
  }

  /** Кнопка корзины, а после добавления — счётчик «− N +», как у Ozon. */
  private bindCart(p: Parts, item: ListingItem, actions: TileActions): void {
    const title = item.cartTitle ?? 'В корзину';
    const stepper = buildStepper(p.cart);
    p.cart.after(stepper.el);
    // Нажатия копятся в целевое количество; после ответа Ozon отправляем последнее значение.
    let target = item.inCart;
    let busy = false;

    const render = () => {
      p.cartLabel.textContent = title;
      const shown = busy ? target : item.inCart;
      p.cart.style.display = shown > 0 ? 'none' : '';
      stepper.el.style.display = shown > 0 ? 'flex' : 'none';
      stepper.qty.textContent = String(shown);
    };
    const sync = async () => {
      if (busy) return;
      busy = true;
      try {
        while (target !== item.inCart) {
          const want = target;
          // Состояние храним в самом товаре — перерисовка списка его не сбросит.
          item.inCart = await actions.cart(item.sku, want);
          if (target === want) target = item.inCart;
        }
      } catch (err) {
        console.warn('[ozon-sku] cart update failed', item.sku, err);
        target = item.inCart;
        if (item.inCart === 0) {
          busy = false;
          render();
          p.cartLabel.textContent = FAIL_TEXT;
          setTimeout(render, FAIL_MS);
          return;
        }
      } finally {
        busy = false;
      }
      render();
    };
    const change = (delta: number) => {
      target = Math.max(0, target + delta);
      render();
      void sync();
    };

    render();
    p.cart.addEventListener('click', (e) => (stop(e), change(1)));
    stepper.minus.addEventListener('click', (e) => (stop(e), change(-1)));
    stepper.plus.addEventListener('click', (e) => (stop(e), change(1)));
  }

  private bindHeart(heart: HTMLButtonElement, item: ListingItem, actions: TileActions): void {
    const outline = heart.querySelector('svg')?.cloneNode(true) as SVGElement | undefined;
    let busy = false;
    const render = () => {
      heart.setAttribute(FAV_ATTR, item.isFav ? 'on' : 'off');
      const svg = heart.querySelector('svg');
      if (!svg) return;
      if (item.isFav) {
        const filled = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        filled.setAttribute('width', svg.getAttribute('width') ?? '24');
        filled.setAttribute('height', svg.getAttribute('height') ?? '24');
        filled.setAttribute('viewBox', '0 0 24 24');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'var(--graphicAccentPrimary, #f91155)');
        path.setAttribute('d', FILLED_HEART);
        filled.append(path);
        svg.replaceWith(filled);
      } else if (outline) svg.replaceWith(outline.cloneNode(true));
    };
    render();
    heart.addEventListener('click', async (e) => {
      stop(e);
      if (busy) return;
      busy = true;
      try {
        await actions.favorite(item.sku, !item.isFav);
        item.isFav = !item.isFav;
        render();
      } catch (err) {
        console.warn('[ozon-sku] favorite failed', item.sku, err);
      } finally {
        busy = false;
      }
    });
  }
}
