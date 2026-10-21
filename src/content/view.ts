import type { ListingItem } from '../lib/listing';
import { reviewsLabel } from '../lib/text';
import type { TileActions, TileFactory } from './tiles';

export interface ViewEntry {
  item: ListingItem;
  /** Отзывы этого SKU, если у товара есть варианты. */
  variant: number | null;
  /** Отзывы группы (для товара без вариантов — его собственные). */
  group: number | null;
}

export interface ViewAction {
  label: string;
  onClick: () => void;
}

export interface ViewOptions {
  /** Фабрика карточек «как у Ozon»; если её нет — простые карточки. */
  factory?: () => TileFactory | null;
  actions?: TileActions;
}

const VIEW_ATTR = 'data-ozon-sku-view';
const DISPLAY_ATTR = 'data-ozon-sku-display';

const css = (el: HTMLElement, style: string) => ((el.style.cssText = style), el);

/**
 * Наш отсортированный список вместо виртуальной сетки Ozon.
 * Живёт в обычном DOM, чтобы на клоны карточек действовали стили Ozon.
 */
export class SortedView {
  readonly root = document.createElement('div');
  private head = css(document.createElement('div'), 'display: flex; align-items: center; gap: 12px; margin: 4px 0 16px;');
  private grid: HTMLElement | null = null;
  private mode: 'tile' | 'simple' | null = null;
  /** Карточки по SKU: при обновлении переставляем и правим только изменившиеся, а не пересоздаём всё. */
  private cards = new Map<string, { key: string; el: HTMLElement }>();
  private moreBox = css(document.createElement('div'), 'display: flex; justify-content: center; margin-top: 20px;');
  private moreBtn = css(
    document.createElement('button'),
    'font: inherit; font-weight: 600; cursor: pointer; border: 0; border-radius: 12px; padding: 12px 20px; color: #fff; background: var(--bgActionPrimary, #005bff);',
  );
  private moreAction: (() => void) | null = null;

  constructor(
    private anchor: HTMLElement,
    private opts: ViewOptions = {},
  ) {
    this.root.setAttribute(VIEW_ATTR, '');
    css(this.root, 'margin-bottom: 24px;');
    this.head.className = 'tsHeadline400Small';
    this.head.setAttribute('data-ozon-sku-header', '');
    this.moreBtn.className = 'tsBodyControl500Medium';
    this.moreBtn.addEventListener('click', () => this.moreAction?.());
    this.moreBox.append(this.moreBtn);
  }

  /** Привязан ли список к этому элементу сетки Ozon (Ozon может пересоздать его после загрузки). */
  isFor(anchor: HTMLElement): boolean {
    return this.anchor === anchor;
  }

  get shown(): boolean {
    return this.root.isConnected;
  }

  show(): void {
    if (this.shown) return;
    // Запоминаем только display: остальные стили сетки Ozon может менять, пока она скрыта.
    if (!this.anchor.hasAttribute(DISPLAY_ATTR)) {
      const s = this.anchor.style;
      this.anchor.setAttribute(DISPLAY_ATTR, `${s.getPropertyValue('display')}|${s.getPropertyPriority('display')}`);
    }
    this.anchor.style.setProperty('display', 'none', 'important');
    this.anchor.before(this.root);
  }

  hide(): void {
    this.root.remove();
    this.root.replaceChildren();
    this.grid = null;
    this.mode = null;
    this.cards.clear();
    const orig = this.anchor.getAttribute(DISPLAY_ATTR);
    if (orig !== null) {
      const [value, priority] = orig.split('|');
      if (value) this.anchor.style.setProperty('display', value, priority);
      else this.anchor.style.removeProperty('display');
      if (!this.anchor.getAttribute('style')) this.anchor.removeAttribute('style');
      this.anchor.removeAttribute(DISPLAY_ATTR);
    }
  }

  render(entries: ViewEntry[], header: string, more?: ViewAction): void {
    if (this.head.textContent !== header) this.head.textContent = header;

    const factory = this.opts.factory?.() ?? null;
    const actions = this.opts.actions;
    const mode = factory && actions ? 'tile' : 'simple';
    if (mode !== this.mode || !this.grid) {
      this.mode = mode;
      this.cards.clear();
      this.grid =
        factory && actions
          ? factory.grid()
          : css(document.createElement('div'), 'display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px 12px;');
    }
    const grid = this.grid;

    const nodes = entries.map((e) => {
      const key = `${e.variant}|${e.group}`;
      let card = this.cards.get(e.item.sku);
      if (!card || card.key !== key) {
        const el = factory && actions ? factory.build(e, actions) : simpleCard(e);
        card = { key, el };
        this.cards.set(e.item.sku, card);
      }
      return card.el;
    });
    const wanted = new Set(entries.map((e) => e.item.sku));
    for (const sku of [...this.cards.keys()]) if (!wanted.has(sku)) this.cards.delete(sku);

    // Переставляем только то, что стоит не на месте: лишние перемещения сбивают наведение и клики.
    nodes.forEach((node, i) => {
      if (grid.children[i] !== node) grid.insertBefore(node, grid.children[i] ?? null);
    });
    while (grid.children.length > nodes.length) grid.lastElementChild!.remove();

    this.moreAction = more?.onClick ?? null;
    if (more && this.moreBtn.textContent !== more.label) this.moreBtn.textContent = more.label;

    const parts = more ? [this.head, grid, this.moreBox] : [this.head, grid];
    if (parts.some((p, i) => this.root.children[i] !== p) || this.root.children.length !== parts.length) {
      this.root.replaceChildren(...parts);
    }
  }
}

/** Запасная карточка, если на странице не нашлось карточки-шаблона Ozon. */
function simpleCard(e: ViewEntry): HTMLElement {
  const { item } = e;
  const a = document.createElement('a');
  css(a, 'display: flex; flex-direction: column; gap: 6px; color: inherit; text-decoration: none; min-width: 0;');
  a.className = 'card';
  a.href = item.href;
  a.target = '_blank';
  a.rel = 'noopener';

  const img = css(
    document.createElement('div'),
    'aspect-ratio: 3 / 4; border-radius: 12px; overflow: hidden; background: var(--bgSecondary, #f2f3f5); display: flex; align-items: center; justify-content: center;',
  );
  if (item.image) {
    const el = css(document.createElement('img'), 'width: 100%; height: 100%; object-fit: contain;') as HTMLImageElement;
    el.src = item.image;
    el.alt = '';
    el.loading = 'lazy';
    img.append(el);
  }
  const price = document.createElement('div');
  price.className = 'tsHeadline500Medium';
  price.textContent = item.price ?? '';
  const title = css(document.createElement('div'), 'display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;');
  title.className = 'tsBody500Medium';
  title.textContent = item.title;
  const meta = css(document.createElement('div'), 'color: var(--textSecondary, #707f8d);');
  meta.className = 'tsBodyControl300XSmall';
  meta.textContent = `${item.rating ? `★ ${item.rating} · ` : ''}${reviewsLabel(e.variant, e.group)}`;
  a.append(img, price, title, meta);
  return a;
}
