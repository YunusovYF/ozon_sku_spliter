import { describe, expect, it } from 'vitest';
import { moved, rank } from '../src/lib/rank';

describe('rank', () => {
  it('orders known values desc (stable), unknown last in DOM order', () => {
    expect(
      rank([
        { key: 'a', value: 5 },
        { key: 'b', value: null },
        { key: 'c', value: 9 },
        { key: 'd', value: 5 },
        { key: 'e', value: null },
      ]),
    ).toEqual(['c', 'a', 'd', 'b', 'e']);
  });
});

describe('moved', () => {
  it('counts positions that change', () => {
    expect(moved(['a', 'b', 'c'], ['a', 'c', 'b'])).toBe(2);
  });
  it('is zero for identical order', () => {
    expect(moved(['a', 'b'], ['a', 'b'])).toBe(0);
  });
});
