export interface RankItem {
  key: string;
  value: number | null;
}

/** Известные значения по убыванию (стабильно по DOM), неизвестные — в конце в порядке DOM. */
export function rank(items: RankItem[]): string[] {
  const known = items.filter((i) => i.value !== null).sort((a, b) => b.value! - a.value!);
  const unknown = items.filter((i) => i.value === null);
  return [...known, ...unknown].map((i) => i.key);
}

/** Сколько позиций изменится, если перейти от current к next. */
export function moved(current: string[], next: string[]): number {
  return next.reduce((n, key, i) => (current[i] !== key ? n + 1 : n), 0);
}
