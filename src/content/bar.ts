const STYLE = `
:host { all: initial; }
.bar {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483000;
  font: 500 15px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 10px 18px; border-radius: 14px;
  color: #fff; background: #001a34; box-shadow: 0 4px 16px rgba(0, 0, 0, .2);
}
button {
  all: unset; cursor: pointer; display: block;
}
.bar.action { background: #005bff; }
.bar.action:hover { background: #0050e0; }
`;

/** Плашка внизу экрана: прогресс сбора отзывов или кнопка «Пересортировать (+N)». */
export class ResortBar {
  readonly root: ShadowRoot;
  private hostEl = document.createElement('div');
  private offered: number | null = null;
  private onClick: (() => void) | null = null;

  constructor(private host: HTMLElement = document.body) {
    this.hostEl.setAttribute('data-ozon-sku-bar', '');
    this.root = this.hostEl.attachShadow({ mode: 'open' });
  }

  progress(done: number, total: number): void {
    this.offered = null;
    const bar = this.frame('bar');
    bar.textContent = `Собираю отзывы ${done} / ${total}`;
  }

  offer(n: number, onClick: () => void): void {
    this.onClick = onClick;
    // Та же плашка уже показана — не пересоздаём кнопку, иначе клик между mousedown и mouseup потеряется.
    if (this.offered === n && this.hostEl.isConnected) return;
    this.offered = n;
    const bar = this.frame('bar action');
    const btn = document.createElement('button');
    btn.textContent = `Пересортировать (+${n})`;
    btn.addEventListener('click', () => this.onClick?.());
    bar.append(btn);
  }

  hide(): void {
    this.offered = null;
    this.root.replaceChildren();
  }

  private frame(cls: string): HTMLElement {
    if (!this.hostEl.isConnected) this.host.appendChild(this.hostEl);
    const style = document.createElement('style');
    style.textContent = STYLE;
    const bar = document.createElement('div');
    bar.className = cls;
    this.root.replaceChildren(style, bar);
    return bar;
  }
}
