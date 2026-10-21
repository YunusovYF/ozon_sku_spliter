import { setCartQuantity, setFavorite } from '../lib/actions';
import { BlockedError, fetchVariantReviews, type ReviewsResult } from '../lib/api';
import { chromeKV, ReviewsCache, type KV } from '../lib/cache';
import { applyLabel, findCards, isLabelStale, removeLabel, type CardInfo } from '../lib/cards';
import { fetchListing, type ListingItem } from '../lib/listing';
import { RequestQueue } from '../lib/queue';
import { moved, rank } from '../lib/rank';
import { loadSettings, saveSettings } from '../lib/settings';
import { ResortBar } from './bar';
import { HeaderCounters } from './header';
import { TileFactory } from './tiles';
import { TogglesBlock } from './toggles';
import { SortedView, type ViewEntry } from './view';

const SCAN_DEBOUNCE_MS = 300;
const SCAN_MAX_WAIT_MS = 1000;
const LISTING_DELAY_MS = 300;
// Одна страница выдачи, как её показывает сайт при открытии: 3 куска API по 8 товаров.
const DEFAULT_PAGES = 3;
const SKU_ATTR = 'data-ozon-sku';
const PAGINATOR = '[data-widget="infiniteVirtualPaginator"]';
const FILTERS = '[data-widget="filtersDesktop"]';
const LISTING_FAIL_TEXT = 'Не удалось загрузить выдачу для сортировки — показана обычная';
const BLOCKED_TEXT = 'Ozon ограничил запросы — обновите страницу позже';

export interface StartOptions {
  root: Document;
  kv: KV;
  fetchFn?: typeof fetch;
  /** Сколько кусков выдачи API (по 8 товаров) собирать за раз для сортировки. */
  pages?: number;
}

type Known = ReviewsResult | 'error';

interface Crawl {
  items: ListingItem[];
  seen: Set<string>;
  next: string | null;
  running: boolean;
  token: number;
  /** Выдача не загрузилась (не блокировка, а ошибка). */
  failed: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function start({ root, kv, fetchFn = fetch.bind(globalThis), pages = DEFAULT_PAGES }: StartOptions) {
  let settings = await loadSettings(kv);
  const cache = new ReviewsCache(kv);
  const known = new Map<string, Known>();
  const requested = new Set<string>();
  const bar = new ResortBar(root.body);
  const headerCounters = new HeaderCounters(root);
  let view: SortedView | null = null;
  let crawl: Crawl | null = null;
  let frozen: string[] | null = null;
  let blocked = false;
  let lastUrl = location.href.split('#')[0];

  const queue = new RequestQueue(async (sku) => {
    try {
      const r = await fetchVariantReviews(sku, fetchFn);
      known.set(sku, r);
      await cache.set(sku, r);
    } catch (e) {
      if (!(e instanceof BlockedError)) known.set(sku, 'error');
      throw e;
    } finally {
      scan();
    }
  });

  function onBlocked(): void {
    if (blocked) return;
    blocked = true;
    queue.stop();
    toggles.setStatus(BLOCKED_TEXT);
    scan();
  }
  queue.onBlocked = onBlocked;
  queue.onIdle = () => scan();

  const toggles = new TogglesBlock(root, settings, (next) => {
    const sortChanged = next.sort !== settings.sort;
    settings = next;
    saveSettings(kv, next).catch((e) => console.warn('[ozon-sku] settings save failed', e));
    if (sortChanged) resetSort();
    scan();
  });

  const observed = new Set<Element>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const sku = e.target.getAttribute(SKU_ATTR);
      if (e.isIntersecting && sku) queue.prioritize(sku);
    }
  });

  function request(sku: string): void {
    if (requested.has(sku)) return;
    requested.add(sku);
    cache
      .get(sku)
      .then((cached) => {
        if (!cached) return queue.add(sku);
        known.set(sku, cached);
        scan();
      })
      .catch((e) => {
        // Без этого товар навсегда остался бы «в процессе», и сортировка не завершилась бы.
        console.warn('[ozon-sku] cache read failed', sku, e);
        known.set(sku, 'error');
        scan();
      });
  }

  function updateLabel(card: CardInfo): void {
    const r = known.get(card.sku);
    const labeled = card.reviewsEl.hasAttribute('data-ozon-sku-label');
    if (!settings.labels) {
      if (labeled) removeLabel(card);
    } else if (r && r !== 'error' && r.kind === 'variant' && (!labeled || isLabelStale(card))) {
      applyLabel(card, r.variant);
    }
  }

  // ---- Сортировка: свой список вместо виртуальной сетки Ozon ----

  function resetSort(): void {
    if (crawl) crawl.token = -1;
    crawl = null;
    frozen = null;
    view?.hide();
    view = null;
    bar.hide();
  }

  async function crawlPages(c: Crawl, count: number): Promise<void> {
    if (c.running) return;
    c.running = true;
    const token = c.token;
    try {
      for (let i = 0; i < count && c.next && !blocked && c.token === token; i++) {
        const page = await fetchListing(c.next, fetchFn);
        if (c.token !== token) return;
        for (const item of page.items) {
          if (c.seen.has(item.sku)) continue;
          c.seen.add(item.sku);
          c.items.push(item);
          request(item.sku);
        }
        c.next = page.next;
        scan();
        await sleep(LISTING_DELAY_MS);
      }
    } catch (e) {
      if (e instanceof BlockedError) onBlocked();
      else {
        console.warn('[ozon-sku] listing failed', e);
        c.failed = true;
      }
    } finally {
      if (c.token === token) c.running = false;
      scan();
    }
  }

  function entryOf(item: ListingItem): ViewEntry {
    const r = known.get(item.sku);
    if (!r || r === 'error') return { item, variant: null, group: item.groupReviews };
    if (r.kind === 'variant') return { item, variant: r.variant, group: r.group };
    return { item, variant: null, group: r.group ?? item.groupReviews };
  }

  const valueOf = (e: ViewEntry) => (known.has(e.item.sku) ? (e.variant ?? e.group) : null);

  function resort(): void {
    if (!crawl) return;
    frozen = rank(crawl.items.map((item) => ({ key: item.sku, value: valueOf(entryOf(item)) })));
    scan();
  }

  function updateSort(): void {
    const anchor = root.querySelector<HTMLElement>(PAGINATOR);
    // Только выдача поиска/категорий: там есть фильтры, а значит, и наш переключатель, чтобы выключить сортировку.
    if (!anchor || !root.querySelector(FILTERS)) {
      if (view) {
        view.hide();
        view = null;
      }
      return;
    }
    if (!crawl) {
      crawl = { items: [], seen: new Set(), next: location.pathname + location.search, running: false, token: 1, failed: false };
      void crawlPages(crawl, pages);
    }
    const c = crawl;
    // Выдача не загрузилась или пустая — возвращаем сетку Ozon, а не висим на «Собираю…».
    if (!c.running && !c.items.length) {
      if (view) {
        view.hide();
        view = null;
      }
      if (c.failed) toggles.setStatus(LISTING_FAIL_TEXT);
      bar.hide();
      return;
    }
    // Ozon пересоздал сетку (гидратация после загрузки, перерисовка) — переносим список к новой.
    if (view && !view.isFor(anchor)) {
      view.hide();
      view = null;
    }
    if (!view) {
      let factory: TileFactory | null = null;
      view = new SortedView(anchor, {
        // Шаблон берём с первой полноценной карточки Ozon; она есть в DOM и после скрытия сетки.
        factory: () => (factory ??= TileFactory.fromDocument(root)),
        actions: {
          cart: async (sku, qty) => {
            const state = await setCartQuantity(sku, qty, fetchFn);
            headerCounters.setCart(state.total);
            return state.quantity;
          },
          favorite: async (sku, on) => {
            await setFavorite(sku, on, fetchFn);
            headerCounters.addFavorites(on ? 1 : -1);
          },
        },
      });
    }
    view.show();
    const entries = c.items.map(entryOf);
    const done = c.items.filter((i) => known.has(i.sku)).length;

    if (!frozen) {
      const ready = !c.running && (blocked || (queue.idle && done === c.items.length));
      if (!ready || !c.items.length) {
        view.render([], c.items.length ? `Собираю отзывы ${done} / ${c.items.length}…` : 'Собираю выдачу…');
        return;
      }
      frozen = rank(entries.map((e) => ({ key: e.item.sku, value: valueOf(e) })));
    }

    // Замороженный порядок; новые товары — в конце, в порядке выдачи.
    const bySku = new Map(entries.map((e) => [e.item.sku, e]));
    const inFrozen = new Set(frozen);
    const display = [...frozen.filter((s) => bySku.has(s)), ...entries.map((e) => e.item.sku).filter((s) => !inFrozen.has(s))];
    const partial = blocked && c.items.some((i) => !known.has(i.sku) || known.get(i.sku) === 'error');
    const header = c.running
      ? `Товаров: ${c.items.length} · загружаю ещё…`
      : `Отсортировано по реальным отзывам · Товаров: ${c.items.length}${partial ? ' · частично: Ozon ограничил запросы' : ''}`;
    const more = !c.running && c.next && !blocked ? { label: 'Загрузить ещё', onClick: () => void crawlPages(c, pages) } : undefined;
    // «Реальные отзывы» выключены — показываем, как Ozon, общее число; порядок остаётся по реальным.
    const shown = display.map((s) => bySku.get(s)!).map((e) => (settings.labels ? e : { ...e, variant: null }));
    view.render(shown, header, more);

    const n = moved(display, rank(entries.map((e) => ({ key: e.item.sku, value: valueOf(e) }))));
    if (n > 0) bar.offer(n, resort);
    else bar.hide();
  }

  function scan(): void {
    const url = location.href.split('#')[0];
    if (url !== lastUrl) {
      lastUrl = url;
      resetSort();
    }
    toggles.ensure();

    const fetching = settings.labels || settings.sort;
    for (const card of findCards(root)) {
      if (card.el.getAttribute(SKU_ATTR) !== card.sku) {
        card.el.setAttribute(SKU_ATTR, card.sku);
        io.observe(card.el);
        observed.add(card.el);
      }
      if (!known.has(card.sku) && fetching) request(card.sku);
      updateLabel(card);
    }

    // Карточки, которые Ozon удалил, перестаём наблюдать — иначе наблюдатель держит их в памяти.
    for (const el of observed) {
      if (!el.isConnected) {
        io.unobserve(el);
        observed.delete(el);
      }
    }

    if (settings.sort) updateSort();
    else if (view) resetSort();
  }

  // Debounce с ограничением ожидания: при непрерывных мутациях (карусели) scan всё равно срабатывает.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstMutation: number | null = null;
  const runScan = () => {
    timer = null;
    firstMutation = null;
    scan();
  };
  const mo = new MutationObserver(() => {
    firstMutation ??= Date.now();
    if (timer) clearTimeout(timer);
    const left = SCAN_MAX_WAIT_MS - (Date.now() - firstMutation);
    timer = setTimeout(runScan, Math.max(0, Math.min(SCAN_DEBOUNCE_MS, left)));
  });
  mo.observe(root.body, { childList: true, subtree: true, characterData: true });

  scan();
  return {
    queue,
    bar,
    toggles,
    view: () => view,
    stop() {
      mo.disconnect();
      io.disconnect();
      queue.stop();
      if (crawl) crawl.token = -1;
      if (timer) clearTimeout(timer);
    },
  };
}

// Защита от двойного запуска (расширение загружено дважды или включены две версии).
const RUNNING_ATTR = 'data-ozon-sku-running';
if (typeof chrome !== 'undefined' && chrome.storage?.local && !document.documentElement.hasAttribute(RUNNING_ATTR)) {
  document.documentElement.setAttribute(RUNNING_ATTR, '');
  start({ root: document, kv: chromeKV() }).catch((e) => console.warn('[ozon-sku] start failed', e));
}
