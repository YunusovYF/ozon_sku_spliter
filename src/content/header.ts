const HEADER = '[data-widget="header"]';
const BADGE_ATTR = 'data-ozon-sku-badge';

/**
 * Обновляет бейджи «Избранное» и «Корзина» в шапке Ozon после наших действий.
 * Сам Ozon хранит счётчики во внутреннем состоянии и узнаёт об изменениях только после перезагрузки.
 */
export class HeaderCounters {
  constructor(private root: Document) {}

  setCart(total: number): void {
    this.set('a[href="/cart"], a[href^="/cart?"]', total);
  }

  addFavorites(delta: number): void {
    const badge = this.badge('a[href*="/my/favorites"]');
    // «99+» — точного числа не знаем, лучше не трогать.
    if (badge && /\+$/.test((badge.textContent ?? '').trim())) return;
    const current = badge && badge.style.display !== 'none' ? Number(badge.textContent) || 0 : 0;
    this.set('a[href*="/my/favorites"]', Math.max(0, current + delta));
  }

  private links(): HTMLAnchorElement[] {
    return [...this.root.querySelectorAll<HTMLAnchorElement>(`${HEADER} a`)];
  }

  /** Бейдж — прямой потомок ссылки, текст которого состоит только из цифр. */
  private badge(selector: string): HTMLElement | null {
    const link = this.root.querySelector<HTMLAnchorElement>(`${HEADER} ${selector}`);
    if (!link) return null;
    return (
      link.querySelector<HTMLElement>(`[${BADGE_ATTR}]`) ??
      ([...link.children].find((c) => /^\d+\+?$/.test((c.textContent ?? '').trim())) as HTMLElement | undefined) ??
      null
    );
  }

  private set(selector: string, value: number): void {
    const link = this.root.querySelector<HTMLAnchorElement>(`${HEADER} ${selector}`);
    if (!link) return;
    let badge = this.badge(selector);
    if (!badge) {
      // Нет своего бейджа (было 0) — копируем оформление бейджа соседней ссылки.
      const proto = this.links()
        .filter((a) => a !== link)
        .map((a) => [...a.children].find((c) => /^\d+\+?$/.test((c.textContent ?? '').trim())))
        .find(Boolean);
      badge = proto ? (proto.cloneNode(true) as HTMLElement) : ownBadge(link);
      link.append(badge);
    }
    badge.setAttribute(BADGE_ATTR, '');
    // Меняем текст в узле Ozon, а не заменяем узел: тогда его собственные обновления продолжат отображаться.
    const node = [...badge.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    if (node && badge.childNodes.length === 1) node.textContent = String(value);
    else badge.textContent = String(value);
    badge.style.display = value > 0 ? '' : 'none';
  }
}

/** Свой бейдж в стиле Ozon, если в шапке нет ни одного, с которого можно скопировать оформление. */
function ownBadge(link: HTMLAnchorElement): HTMLElement {
  if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
  const b = document.createElement('div');
  b.style.cssText =
    'position: absolute; top: -6px; left: calc(50% + 4px); min-width: 18px; height: 18px; padding: 0 5px;' +
    'box-sizing: border-box; border-radius: 9px; font: 600 12px/18px system-ui, sans-serif; text-align: center;' +
    'color: #fff; background: var(--bgAccentPrimary, #f91155);';
  return b;
}
