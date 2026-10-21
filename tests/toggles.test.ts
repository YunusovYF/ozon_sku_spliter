import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from './fixtures/filters.html?raw';
import { TogglesBlock } from '../src/content/toggles';

beforeEach(() => {
  document.body.innerHTML = html;
});

const block = () => document.querySelectorAll('[data-ozon-sku-toggles]');
const inputs = () => [...document.querySelectorAll<HTMLInputElement>('[data-ozon-sku-toggles] input[type=checkbox]')];

describe('TogglesBlock', () => {
  it('inserts one block right before the sale row', () => {
    const t = new TogglesBlock(document, { labels: true, sort: false }, () => {});
    t.ensure();
    t.ensure();
    expect(block()).toHaveLength(1);
    expect(block()[0].nextElementSibling?.id).toBe('sale-row');
    expect(block()[0].textContent).toContain('Реальные отзывы');
    expect(block()[0].textContent).toContain('Сортировать по отзывам');
    expect(block()[0].textContent).not.toContain('Распродажа');
  });

  it('reflects settings in checkboxes and reports changes', () => {
    const onChange = vi.fn();
    new TogglesBlock(document, { labels: true, sort: false }, onChange).ensure();
    expect(inputs().map((i) => i.checked)).toEqual([true, false]);
    inputs()[1].click();
    expect(onChange).toHaveBeenLastCalledWith({ labels: true, sort: true });
    inputs()[0].click();
    expect(onChange).toHaveBeenLastCalledWith({ labels: false, sort: true });
  });

  it('re-inserts the block after React removes it', () => {
    const t = new TogglesBlock(document, { labels: true, sort: false }, () => {});
    t.ensure();
    block()[0].remove();
    t.ensure();
    expect(block()).toHaveLength(1);
  });

  it('grows the fixed-height filters widget by the block height', () => {
    const t = new TogglesBlock(document, { labels: true, sort: false }, () => {});
    t.ensure();
    const w = document.querySelector<HTMLElement>('[data-widget="filtersDesktop"]')!;
    expect(w.style.maxHeight).toBe('none');
    expect(w.style.minHeight).toBe('');
  });

  it('falls back to the top of the filters aside without a sale row', () => {
    document.getElementById('sale-row')!.remove();
    new TogglesBlock(document, { labels: true, sort: false }, () => {}).ensure();
    expect(document.querySelector('aside')!.firstElementChild!.hasAttribute('data-ozon-sku-toggles')).toBe(true);
  });

  it('does nothing without filters', () => {
    document.body.innerHTML = '<div></div>';
    new TogglesBlock(document, { labels: true, sort: false }, () => {}).ensure();
    expect(block()).toHaveLength(0);
  });

  it('shows status text', () => {
    const t = new TogglesBlock(document, { labels: true, sort: false }, () => {});
    t.ensure();
    t.setStatus('Ozon ограничил запросы — обновите страницу позже');
    expect(block()[0].textContent).toContain('Ozon ограничил запросы');
    t.setStatus(null);
    expect(block()[0].textContent).not.toContain('Ozon ограничил запросы');
  });

  it('never climbs above the filters widget looking for the sale row', () => {
    // Секций меньше пяти — раньше поиск уходил вверх по странице за пределы фильтров.
    document.body.innerHTML = `<main><section>a</section><section>b</section><section>c</section><section>d</section>
      <div data-widget="filtersDesktop"><aside><div><div id="sale-row"><span>Распродажа</span><label><input type="checkbox"></label></div></div></aside></div></main>`;
    new TogglesBlock(document, { labels: true, sort: false }, () => {}).ensure();
    const b = document.querySelector('[data-ozon-sku-toggles]')!;
    expect(b.closest('[data-widget="filtersDesktop"]')).not.toBeNull();
    expect(document.querySelectorAll('main > section')).toHaveLength(4);
  });

  it('uses plain rows when the matched sale element has no checkbox', () => {
    document.querySelector('#sale-row label')!.remove();
    new TogglesBlock(document, { labels: true, sort: false }, () => {}).ensure();
    expect(inputs()).toHaveLength(2);
  });
});
