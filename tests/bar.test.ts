import { describe, expect, it, vi } from 'vitest';
import { ResortBar } from '../src/content/bar';

describe('ResortBar', () => {
  it('shows progress', () => {
    const b = new ResortBar(document.body);
    b.progress(12, 36);
    expect(b.root.textContent).toContain('Собираю отзывы 12 / 36');
  });
  it('offers resort and calls back on click', () => {
    const b = new ResortBar(document.body);
    const fn = vi.fn();
    b.offer(3, fn);
    const btn = b.root.querySelector('button')!;
    expect(btn.textContent).toBe('Пересортировать (+3)');
    btn.click();
    expect(fn).toHaveBeenCalledOnce();
  });
  it('hide clears content', () => {
    const b = new ResortBar(document.body);
    b.progress(1, 2);
    b.hide();
    expect(b.root.textContent).toBe('');
  });

  it('keeps the same button when offered again with the same number', () => {
    const b = new ResortBar(document.body);
    b.offer(3, () => {});
    const btn = b.root.querySelector('button');
    b.offer(3, () => {});
    expect(b.root.querySelector('button')).toBe(btn);
  });
});
