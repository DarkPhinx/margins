/**
 * Crossway's API limits. Plain TypeScript with no DOM or Node APIs, so the
 * Supabase edge function can reuse it. The limits apply to the whole API key,
 * across all users. The edge function is the real gatekeeper; the browser
 * limiter is a courtesy that avoids pointless requests.
 */

export interface WindowLimit {
  windowMs: number;
  max: number;
}

export const CROSSWAY_LIMITS: readonly WindowLimit[] = [
  { windowMs: 60_000, max: 60 },
  { windowMs: 3_600_000, max: 1_000 },
  { windowMs: 86_400_000, max: 5_000 },
];

export const MAX_VERSES_PER_QUERY = 500;

/** Where request times are kept. The edge function can back this with Postgres. */
export interface HitStore {
  list(): number[];
  record(time: number): void;
  prune(before: number): void;
}

export function memoryHitStore(): HitStore {
  let hits: number[] = [];
  return {
    list: () => hits,
    record: (t) => {
      hits.push(t);
    },
    prune: (before) => {
      hits = hits.filter((t) => t >= before);
    },
  };
}

export type LimitDecision = { ok: true } | { ok: false; retryAfterMs: number };

export interface RateLimiterOptions {
  limits?: readonly WindowLimit[];
  now?: () => number;
  store?: HitStore;
}

export class RateLimiter {
  private readonly limits: readonly WindowLimit[];
  private readonly now: () => number;
  private readonly store: HitStore;
  private blockedUntil = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.limits = options.limits ?? CROSSWAY_LIMITS;
    this.now = options.now ?? (() => Date.now());
    this.store = options.store ?? memoryHitStore();
  }

  check(): LimitDecision {
    const now = this.now();
    if (now < this.blockedUntil) return { ok: false, retryAfterMs: this.blockedUntil - now };
    const longest = Math.max(...this.limits.map((l) => l.windowMs));
    this.store.prune(now - longest);
    const hits = this.store.list();
    let wait = 0;
    for (const limit of this.limits) {
      const inWindow = hits.filter((t) => t > now - limit.windowMs).sort((a, b) => a - b);
      if (inWindow.length >= limit.max) {
        // Wait until enough of the oldest hits leave the window.
        const freeAt = inWindow[inWindow.length - limit.max]! + limit.windowMs;
        wait = Math.max(wait, freeAt - now);
      }
    }
    return wait > 0 ? { ok: false, retryAfterMs: wait } : { ok: true };
  }

  /** Records a request if the limits allow it. */
  tryAcquire(): LimitDecision {
    const decision = this.check();
    if (decision.ok) this.store.record(this.now());
    return decision;
  }

  /** After a 429 from Crossway, stop until its Retry-After has passed. */
  blockFor(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, this.now() + ms);
  }
}

/** Parses a Retry-After header (seconds or an HTTP date). Defaults to one minute. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 60_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? 60_000 : Math.max(0, date - now);
}
