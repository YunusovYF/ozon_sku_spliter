import { fetchVariantReviews, type ReviewsResult } from '../lib/api';
import { chromeKV, ReviewsCache, type KV } from '../lib/cache';
import { applyLabel, findCards, isLabelStale, type CardInfo } from '../lib/cards';
import { RequestQueue } from '../lib/queue';
import { TopPanel, type TopEntry } from './panel';

const SCAN_DEBOUNCE_MS = 300;
const SCAN_MAX_WAIT_MS = 1000;
const SKU_ATTR = 'data-ozon-sku';

export interface StartOptions {
  root: Document;
  kv: KV;
  fetchFn?: typeof fetch;
}

export function start({ root, kv, fetchFn = fetch.bind(globalThis) }: StartOptions) {
  const cache = new ReviewsCache(kv);
  const known = new Map<string, ReviewsResult>();
  const requested = new Set<string>();
  const panel = new TopPanel(root.body);

  const queue = new RequestQueue(async (sku) => {
    const r = await fetchVariantReviews(sku, fetchFn);
    known.set(sku, r);
    await cache.set(sku, r);
    scan();
  });
  queue.onBlocked = () => panel.setBlocked();

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const sku = e.target.getAttribute(SKU_ATTR);
      if (e.isIntersecting && sku) queue.prioritize(sku);
    }
  });

  function show(card: CardInfo, r: ReviewsResult): TopEntry {
    const base = { sku: card.sku, title: card.title, href: card.href };
    if (r.kind === 'variant') {
      if (!card.reviewsEl.hasAttribute('data-ozon-sku-label') || isLabelStale(card)) applyLabel(card, r.variant);
      return { ...base, variant: r.variant, group: card.group };
    }
    const group = r.group ?? card.group;
    return { ...base, variant: group, group };
  }

  function scan(): void {
    const entries: TopEntry[] = [];
    for (const card of findCards(root)) {
      if (card.el.getAttribute(SKU_ATTR) !== card.sku) {
        card.el.setAttribute(SKU_ATTR, card.sku);
        io.observe(card.el);
      }
      const r = known.get(card.sku);
      if (r) {
        entries.push(show(card, r));
      } else if (!requested.has(card.sku)) {
        requested.add(card.sku);
        cache
          .get(card.sku)
          .then((cached) => {
            if (!cached) return queue.add(card.sku);
            known.set(card.sku, cached);
            scan();
          })
          .catch((e) => console.warn('[ozon-sku] cache read failed', card.sku, e));
      }
    }
    panel.setEntries(entries);
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
    panel,
    stop() {
      mo.disconnect();
      io.disconnect();
      queue.stop();
      if (timer) clearTimeout(timer);
    },
  };
}

if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  start({ root: document, kv: chromeKV() });
}
