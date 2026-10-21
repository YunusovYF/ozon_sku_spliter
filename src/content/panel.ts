import { formatLabel } from '../lib/text';

export interface TopEntry {
  sku: string;
  title: string;
  href: string;
  variant: number;
  group: number;
}

const BLOCKED_TEXT = 'Ozon ограничил запросы — обновите страницу позже';

const STYLE = `
:host { all: initial; }
.panel {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  width: 320px; max-width: calc(100vw - 32px);
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1a1a1a; background: #fff;
  border: 1px solid #d9dde3; border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .12);
  overflow: hidden;
}
header {
  padding: 8px 12px; font-weight: 600; cursor: pointer; user-select: none;
  display: flex; justify-content: space-between; background: #f3f5f8;
}
ol { margin: 0; padding: 4px 0; list-style: none; max-height: 50vh; overflow-y: auto; }
a {
  display: flex; gap: 8px; padding: 4px 12px; color: inherit; text-decoration: none;
}
a:hover { background: #eef3ff; }
.title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.count { flex: none; color: #005bff; font-variant-numeric: tabular-nums; }
.blocked { padding: 8px 12px; color: #b3261e; }
@media (prefers-color-scheme: dark) {
  .panel { color: #e8e8e8; background: #1f2125; border-color: #3a3d42; }
  header { background: #2a2d32; }
  a:hover { background: #2c3445; }
  .count { color: #6f9bff; }
  .blocked { color: #ff8a80; }
}
`;

/** Плавающая панель «Топ по реальным отзывам» в Shadow DOM, чтобы стили Ozon не мешали. */
export class TopPanel {
  readonly root: ShadowRoot;
  private hostEl = document.createElement('div');
  private entries = new Map<string, TopEntry>();
  private blocked = false;
  private collapsed = false;
  private renderedKey: string | null = null;

  constructor(
    private host: HTMLElement = document.body,
    private size = 10,
  ) {
    this.hostEl.setAttribute('data-ozon-sku-panel', '');
    this.root = this.hostEl.attachShadow({ mode: 'open' });
  }

  upsert(e: TopEntry): void {
    this.entries.set(e.sku, e);
    this.update();
  }

  /** Заменяет все записи — топ строится только из товаров, которые сейчас на странице. */
  setEntries(list: TopEntry[]): void {
    this.entries = new Map(list.map((e) => [e.sku, e]));
    this.update();
  }

  setBlocked(): void {
    this.blocked = true;
    this.render();
  }

  private top(): TopEntry[] {
    return [...this.entries.values()].sort((a, b) => b.variant - a.variant).slice(0, this.size);
  }

  /** Перерисовывает только если топ изменился, чтобы не терять клик по ссылке под курсором. */
  private update(): void {
    const key = JSON.stringify(this.top());
    if (key === this.renderedKey) return;
    this.render();
  }

  private render(): void {
    if (!this.hostEl.isConnected) this.host.appendChild(this.hostEl);
    const top = this.top();
    this.renderedKey = JSON.stringify(top);

    const style = document.createElement('style');
    style.textContent = STYLE;
    const panel = document.createElement('div');
    panel.className = 'panel';

    const header = document.createElement('header');
    header.title = 'Свернуть / развернуть';
    header.append('Топ по реальным отзывам', this.collapsed ? '▸' : '▾');
    header.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.render();
    });
    panel.append(header);

    if (!this.collapsed) {
      if (this.blocked) {
        const msg = document.createElement('div');
        msg.className = 'blocked';
        msg.textContent = BLOCKED_TEXT;
        panel.append(msg);
      }
      const list = document.createElement('ol');
      for (const e of top) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = e.href;
        a.title = e.title;
        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = e.title;
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = formatLabel(e.variant, e.group);
        a.append(title, count);
        li.append(a);
        list.append(li);
      }
      panel.append(list);
    }

    this.root.replaceChildren(style, panel);
  }
}
