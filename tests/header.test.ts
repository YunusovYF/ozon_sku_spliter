import { beforeEach, describe, expect, it } from 'vitest';
import { HeaderCounters } from '../src/content/header';

const HEADER = `
<header data-widget="header">
  <a href="/my/favorites"><div class="icon"><svg></svg></div><div class="label"><span>Избранное</span></div><div class="badge b-a2">44</div></a>
  <a href="/cart"><div class="icon"><svg></svg></div><div class="label"><span>Корзина</span></div></a>
</header>`;

const badge = (href: string) => document.querySelector(`header a[href="${href}"] [data-ozon-sku-badge], header a[href="${href}"] .badge`);

beforeEach(() => {
  document.body.innerHTML = HEADER;
});

describe('HeaderCounters', () => {
  it('bumps the favorites badge', () => {
    const h = new HeaderCounters(document);
    h.addFavorites(1);
    expect(badge('/my/favorites')!.textContent).toBe('45');
    h.addFavorites(-2);
    expect(badge('/my/favorites')!.textContent).toBe('43');
  });

  it('creates a cart badge from the favorites one when missing', () => {
    new HeaderCounters(document).setCart(3);
    const b = badge('/cart')!;
    expect(b.textContent).toBe('3');
    expect(b.className).toBe('badge b-a2');
    expect(b.parentElement!.getAttribute('href')).toBe('/cart');
  });

  it('hides the badge at zero', () => {
    const h = new HeaderCounters(document);
    h.setCart(2);
    h.setCart(0);
    expect((badge('/cart') as HTMLElement).style.display).toBe('none');
    h.setCart(1);
    expect((badge('/cart') as HTMLElement).style.display).toBe('');
  });

  it('does nothing without a header', () => {
    document.body.innerHTML = '';
    expect(() => new HeaderCounters(document).setCart(1)).not.toThrow();
  });

  it('draws its own badge when there is none to copy', () => {
    document.querySelector('.badge')!.remove();
    new HeaderCounters(document).setCart(2);
    const b = document.querySelector<HTMLElement>('header a[href="/cart"] [data-ozon-sku-badge]')!;
    expect(b.textContent).toBe('2');
    expect(b.style.position).toBe('absolute');
  });

  it('leaves a capped badge like "99+" alone', () => {
    document.querySelector('.badge')!.textContent = '99+';
    new HeaderCounters(document).addFavorites(1);
    expect(document.querySelector('.badge')!.textContent).toBe('99+');
  });

  it('changes the existing text node so Ozon keeps updating it', () => {
    const b = document.querySelector('.badge')!;
    const node = b.firstChild!;
    new HeaderCounters(document).addFavorites(1);
    expect(b.firstChild).toBe(node);
    node.textContent = '50'; // так Ozon обновляет бейдж сам
    expect(b.textContent).toBe('50');
  });
});
