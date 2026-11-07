import { retryAfterMs } from '../../shared/esv-limits';
import type { EsvPassageRequest, EsvPassageResponse } from '../../shared/esv-contract';

export class EsvHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number,
  ) {
    super(`ESV request failed (${status})`);
  }
}

export interface EsvTransport {
  fetchPassage(request: EsvPassageRequest): Promise<EsvPassageResponse>;
}

/** Calls the edge function. Never calls api.esv.org directly, so the key stays on the server. */
export function httpEsvTransport(endpoint: string, headers: Record<string, string> = {}): EsvTransport {
  return {
    async fetchPassage(request) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(request),
        cache: 'no-store',
      });
      if (!res.ok) throw new EsvHttpError(res.status, retryAfterMs(res.headers.get('retry-after')));
      return (await res.json()) as EsvPassageResponse;
    },
  };
}
