import { describe, expect, it } from 'vitest';
import { extractSku, formatCount, formatLabel, parseCount } from '../src/lib/text';

describe('parseCount', () => {
  it('parses count with thin space and word', () => {
    expect(parseCount('16 873 отзыва')).toBe(16873);
  });
  it('parses bare number (Ozon seller cards)', () => {
    expect(parseCount('93')).toBe(93);
  });
  it('parses number in parentheses with space', () => {
    expect(parseCount('(1 234)')).toBe(1234);
  });
  it('rejects rating', () => {
    expect(parseCount('4.9')).toBeNull();
  });
  it('rejects text without number', () => {
    expect(parseCount('Нет отзывов')).toBeNull();
  });
});

describe('formatCount / formatLabel', () => {
  it('groups thousands with thin space', () => {
    expect(formatCount(16873)).toBe('16 873');
    expect(formatCount(315)).toBe('315');
  });
  it('builds label', () => {
    expect(formatLabel(315, 16873)).toBe('315 из 16 873');
  });
});

describe('extractSku', () => {
  it('takes trailing number from slug', () => {
    expect(
      extractSku('https://www.ozon.ru/product/setevoy-filtr-agni-2043441656/?at=x&from_sku=1'),
    ).toBe('2043441656');
  });
  it('accepts bare id path', () => {
    expect(extractSku('/product/2043441656/')).toBe('2043441656');
  });
  it('rejects non-product url', () => {
    expect(extractSku('/category/foo-15906/')).toBeNull();
  });
});
