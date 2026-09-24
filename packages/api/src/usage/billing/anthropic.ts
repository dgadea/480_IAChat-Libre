import type { BilledLines, BillingSource, BillingSourceOptions } from './source';
import { BILLING_TIMEOUT_MS, addCost, eachPage, readJson } from './source';

type CostReportPage = {
  data: Array<{
    results: Array<{ amount: string; model?: string | null; description?: string | null }>;
  }>;
  has_more: boolean;
  next_page: string | null;
};

/** Anthropic reports cost in cents, as a decimal string */
const centsPerDollar = 100;

/** Billed dollars from Anthropic's Cost Report, which needs an Admin API key */
export function createAnthropicBilling({
  apiKey,
  fetch: fetchImpl = fetch,
  baseURL = 'https://api.anthropic.com/v1',
  timeoutMs = BILLING_TIMEOUT_MS,
}: BillingSourceOptions): BillingSource {
  return {
    provider: 'anthropic',
    async fetchCosts({ from, to }) {
      const lines: BilledLines = new Map();
      const fetchPage = async (cursor: string | null) => {
        const query = new URLSearchParams({
          starting_at: from.toISOString(),
          ending_at: to.toISOString(),
          bucket_width: '1d',
          'group_by[]': 'description',
          limit: '31',
          ...(cursor ? { page: cursor } : {}),
        });
        const response = await fetchImpl(`${baseURL}/organizations/cost_report?${query}`, {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        return readJson<CostReportPage>(response);
      };
      await eachPage(fetchPage, (body) => {
        for (const bucket of body.data) {
          for (const result of bucket.results) {
            const name = result.model || result.description || '';
            addCost(lines, name, Number(result.amount) / centsPerDollar);
          }
        }
      });
      return lines;
    },
  };
}
