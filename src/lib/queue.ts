import { BlockedError } from './api';

export interface QueueOptions {
  concurrency?: number;
  delayMs?: number;
}

/** Очередь запросов: без дублей, с приоритетом, ограничением параллельности и паузой между стартами. */
export class RequestQueue {
  onBlocked?: () => void;
  private pending: string[] = [];
  private seen = new Set<string>();
  private running = 0;
  private lastStart = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _stopped = false;
  private concurrency: number;
  private delayMs: number;

  constructor(
    private worker: (sku: string) => Promise<void>,
    opts: QueueOptions = {},
  ) {
    this.concurrency = opts.concurrency ?? 2;
    this.delayMs = opts.delayMs ?? 400;
  }

  get stopped(): boolean {
    return this._stopped;
  }

  add(sku: string): void {
    if (this._stopped || this.seen.has(sku)) return;
    this.seen.add(sku);
    this.pending.push(sku);
    this.pump();
  }

  prioritize(sku: string): void {
    const i = this.pending.indexOf(sku);
    if (i > 0) {
      this.pending.splice(i, 1);
      this.pending.unshift(sku);
    }
  }

  stop(): void {
    this._stopped = true;
    this.pending = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private pump(): void {
    if (this._stopped || this.timer || this.running >= this.concurrency || !this.pending.length) return;
    const wait = this.lastStart + this.delayMs - Date.now();
    if (wait > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, wait);
      return;
    }
    const sku = this.pending.shift()!;
    this.running++;
    this.lastStart = Date.now();
    this.worker(sku)
      .catch((e) => {
        if (e instanceof BlockedError) {
          if (!this._stopped) {
            this.stop();
            this.onBlocked?.();
          }
        } else {
          console.warn('[ozon-sku] request failed', sku, e);
        }
      })
      .finally(() => {
        this.running--;
        this.pump();
      });
    this.pump();
  }
}
