import { beforeEach, describe, expect, it } from 'vitest';
import { applyLabel, findCards, isLabelStale } from '../src/lib/cards';

import html from './fixtures/grid.html?raw';

beforeEach(() => {
  document.body.innerHTML = html;
});

describe('findCards', () => {
  it('finds cards with review counts, skipping cards without reviews', () => {
    const cards = findCards(document);
    expect(cards.map((c) => [c.sku, c.group])).toEqual([
      ['2043441656', 16873],
      ['4830673586', 93],
      ['2043441656', 16873],
    ]);
  });
  it('takes the longest link text as title', () => {
    expect(findCards(document)[0].title).toBe('Сетевой фильтр, AGNI, 5 розеток 3 USB и 1 TYPE-C');
  });
});

describe('applyLabel', () => {
  it('replaces review text with variant label', () => {
    const [card] = findCards(document);
    applyLabel(card, 315);
    expect(card.reviewsEl.textContent).toBe('315 из 16 873');
    expect(isLabelStale(card)).toBe(false);
  });
  it('keeps group count after re-render restores original text', () => {
    const [card] = findCards(document);
    applyLabel(card, 315);
    card.reviewsEl.textContent = '16 873 отзыва';
    const [again] = findCards(document);
    expect(isLabelStale(again)).toBe(true);
    expect(again.group).toBe(16873);
  });
  it('relabeled card is still found with original group', () => {
    const [card] = findCards(document);
    applyLabel(card, 315);
    const [again] = findCards(document);
    expect(again.group).toBe(16873);
    expect(isLabelStale(again)).toBe(false);
  });
  it('reused node with another product takes fresh group from text', () => {
    const [card] = findCards(document);
    applyLabel(card, 315);
    card.reviewsEl.textContent = '523 отзыва';
    const [again] = findCards(document);
    expect(again.group).toBe(523);
  });
});
