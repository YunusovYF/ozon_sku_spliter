import type { Settings } from '../lib/settings';

const BLOCK_ATTR = 'data-ozon-sku-toggles';
const FILTERS = '[data-widget="filtersDesktop"]';
const SALE_TEXT = 'Распродажа';

const ROWS: { key: keyof Settings; title: string }[] = [
  { key: 'labels', title: 'Реальные отзывы' },
  { key: 'sort', title: 'Сортировать по отзывам' },
];

/** Строка фильтра «Распродажа»: ближайший предок span, лежащий в списке секций (≥ 5 детей). */
function findSaleRow(root: Document): HTMLElement | null {
  const filters = root.querySelector(FILTERS);
  if (!filters) return null;
  const span = [...filters.querySelectorAll('span')].find(
    (s) => !s.childElementCount && s.textContent?.trim() === SALE_TEXT,
  );
  const stopAt = filters.querySelector('aside') ?? filters;
  let row: HTMLElement | null = span ?? null;
  // Поднимаемся до строки в списке секций, но не выше самих фильтров.
  while (row?.parentElement && row.parentElement.children.length < 5 && row.parentElement !== stopAt && row.parentElement !== filters) {
    row = row.parentElement;
  }
  return row && filters.contains(row) && row !== filters ? row : null;
}

/** Класс «включено» у переключателя Ozon: input.X-a0 → X-a1 (вид меняет класс, а не :checked). */
function checkedClass(input: HTMLInputElement): string | null {
  const base = [...input.classList].find((c) => c.endsWith('-a0'));
  return base ? base.replace(/-a0$/, '-a1') : null;
}

function setChecked(input: HTMLInputElement, on: boolean): void {
  input.checked = on;
  const cls = checkedClass(input);
  if (cls) input.classList.toggle(cls, on);
}

/** Блок «Реальные отзывы» / «Сортировать по отзывам» над фильтром «Распродажа». */
export class TogglesBlock {
  private block: HTMLElement | null = null;
  private status: string | null = null;

  constructor(
    private root: Document,
    private settings: Settings,
    private onChange: (s: Settings) => void,
  ) {}

  ensure(): void {
    if (this.block?.isConnected) return;
    const saleRow = findSaleRow(this.root);
    const filters = this.root.querySelector<HTMLElement>(FILTERS);
    if (!filters) return;

    const block = this.root.createElement('div');
    block.setAttribute(BLOCK_ATTR, '');
    // Клонируем строку Ozon, только если в ней есть его переключатель; иначе — простые строки.
    const cloneable = saleRow?.querySelector('input[type=checkbox]') ? saleRow : null;
    for (const { key, title } of ROWS) block.append(cloneable ? this.cloneRow(cloneable, key, title) : this.plainRow(key, title));
    const status = this.root.createElement('div');
    status.setAttribute('data-ozon-sku-status', '');
    status.style.cssText = 'color: var(--textNegative, #d70000); font-size: 13px; margin: 4px 0 8px;';
    block.append(status);

    if (saleRow) saleRow.before(block);
    else (filters.querySelector('aside') ?? filters).prepend(block);

    // Ozon фиксирует высоту виджета фильтров inline-стилем — снимаем ограничение, иначе низ обрежется.
    filters.style.removeProperty('min-height');
    filters.style.setProperty('max-height', 'none');

    this.block = block;
    this.renderStatus();
  }

  setStatus(text: string | null): void {
    this.status = text;
    this.renderStatus();
  }

  private renderStatus(): void {
    const el = this.block?.querySelector<HTMLElement>('[data-ozon-sku-status]');
    if (!el) return;
    el.textContent = this.status ?? '';
    el.style.display = this.status ? '' : 'none';
  }

  private bind(input: HTMLInputElement, key: keyof Settings): void {
    setChecked(input, this.settings[key]);
    input.addEventListener('change', () => {
      setChecked(input, input.checked);
      this.settings = { ...this.settings, [key]: input.checked };
      this.onChange(this.settings);
    });
  }

  private cloneRow(saleRow: HTMLElement, key: keyof Settings, title: string): HTMLElement {
    const row = saleRow.cloneNode(true) as HTMLElement;
    row.removeAttribute('id');
    const span = [...row.querySelectorAll('span')].find((s) => !s.childElementCount && s.textContent?.trim() === SALE_TEXT);
    if (span) span.textContent = title;
    const input = row.querySelector<HTMLInputElement>('input[type=checkbox]');
    if (input) this.bind(input, key);
    return row;
  }

  private plainRow(key: keyof Settings, title: string): HTMLElement {
    const label = this.root.createElement('label');
    label.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin: 8px 0; cursor: pointer; font-size: 16px;';
    const input = this.root.createElement('input');
    input.type = 'checkbox';
    label.append(title, input);
    this.bind(input, key);
    return label;
  }
}
