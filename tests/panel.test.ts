import { beforeEach, describe, expect, it } from 'vitest';
import { TopPanel, type TopEntry } from '../src/content/panel';

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = document.getElementById('host')!;
});

const entry = (sku: string, variant: number): TopEntry => ({
  sku,
  title: `Товар ${sku}`,
  href: `/product/${sku}/`,
  variant,
  group: 1000,
});

const rows = (p: TopPanel) => [...p.root.querySelectorAll('a')];

describe('TopPanel', () => {
  it('renders nothing until first entry', () => {
    new TopPanel(host);
    expect(host.childElementCount).toBe(0);
  });
  it('keeps top N sorted by variant desc', () => {
    const p = new TopPanel(host, 10);
    for (let i = 1; i <= 12; i++) p.upsert(entry(String(i), i * 10));
    const r = rows(p);
    expect(r).toHaveLength(10);
    expect(r[0].getAttribute('href')).toBe('/product/12/');
    expect(r[0].textContent).toContain('120 из 1 000');
  });
  it('upsert of same sku updates instead of duplicating', () => {
    const p = new TopPanel(host);
    p.upsert(entry('a', 5));
    p.upsert(entry('a', 7));
    expect(rows(p)).toHaveLength(1);
    expect(rows(p)[0].textContent).toContain('7 из');
  });
  it('shows blocked message', () => {
    const p = new TopPanel(host);
    p.setBlocked();
    expect(p.root.textContent).toContain('Ozon ограничил запросы — обновите страницу позже');
  });
  it('collapses on header click', () => {
    const p = new TopPanel(host);
    p.upsert(entry('a', 5));
    (p.root.querySelector('header') as HTMLElement).click();
    expect(rows(p)).toHaveLength(0);
  });
  it('does not re-render when top is unchanged (keeps link under cursor)', () => {
    const p = new TopPanel(host);
    p.setEntries([entry('a', 5), entry('b', 3)]);
    const first = rows(p)[0];
    p.setEntries([entry('b', 3), entry('a', 5)]);
    expect(rows(p)[0]).toBe(first);
  });
  it('setEntries replaces previous entries', () => {
    const p = new TopPanel(host);
    p.setEntries([entry('a', 5)]);
    p.setEntries([entry('b', 3)]);
    expect(rows(p).map((a) => a.getAttribute('href'))).toEqual(['/product/b/']);
  });
});
