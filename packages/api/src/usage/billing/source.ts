import type { TProviderBillingError, TUsageProvider } from 'librechat-data-provider';

export type BillingFetch = (url: string, init: RequestInit) => Promise<Response>;

/** A day-aligned UTC window: providers only bill whole days */
export type BillingWindow = { from: Date; to: Date };

/** Dollars billed per model or line item over a window */
export type BilledLines = Map<string, number>;

export type BillingSource = {
  provider: TUsageProvider;
  fetchCosts: (window: BillingWindow) => Promise<BilledLines>;
  /** Reading costs with the key chats use; providers usually demand an admin key */
  usesChatKey?: boolean;
};

export type BillingSourceOptions = {
  apiKey: string;
  fetch?: BillingFetch;
  baseURL?: string;
  timeoutMs?: number;
};

/** Stops paging a provider that keeps answering `has_more` */
export const MAX_BILLING_PAGES = 24;
export const BILLING_TIMEOUT_MS = 20_000;

export class BillingError extends Error {
  constructor(
    readonly code: TProviderBillingError,
    readonly status?: number,
  ) {
    super(`Provider billing request failed: ${code}${status ? ` (${status})` : ''}`);
  }
}

export function billingErrorCode(status: number): TProviderBillingError {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  return status === 429 ? 'rate_limit' : 'failed';
}

export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new BillingError(billingErrorCode(response.status), response.status);
  }
  return (await response.json()) as T;
}

type Page = { has_more: boolean; next_page: string | null };

/** Follows a provider's cursor until it runs out, capped at `MAX_BILLING_PAGES` requests */
export async function eachPage<T extends Page>(
  fetchPage: (cursor: string | null) => Promise<T>,
  onPage: (body: T) => void,
): Promise<void> {
  let cursor: string | null = null;
  for (let request = 0; request < MAX_BILLING_PAGES; request++) {
    const body = await fetchPage(cursor);
    onPage(body);
    if (!body.has_more || !body.next_page) {
      return;
    }
    cursor = body.next_page;
  }
}

export function addCost(lines: BilledLines, name: string, cost: number): void {
  if (!Number.isFinite(cost) || cost === 0) {
    return;
  }
  lines.set(name, (lines.get(name) ?? 0) + cost);
}

const dayMs = 24 * 60 * 60 * 1000;

/** Widens a window to whole UTC days, the only granularity providers bill in */
export function billingWindow(from: Date, to: Date): BillingWindow {
  const start = Math.floor(from.getTime() / dayMs) * dayMs;
  const end = Math.ceil((to.getTime() + 1) / dayMs) * dayMs;
  return { from: new Date(start), to: new Date(end) };
}
