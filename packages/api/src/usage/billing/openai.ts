import type { BilledLines, BillingSource, BillingSourceOptions } from './source';
import { BILLING_TIMEOUT_MS, addCost, eachPage, readJson } from './source';

type CostsPage = {
  data: Array<{
    results: Array<{ amount?: { value?: number | string }; line_item?: string | null }>;
  }>;
  has_more: boolean;
  next_page: string | null;
};

/** `gpt-5, input_tokens` bills under `gpt-5`; items with no suffix keep their whole name */
const lineName = (lineItem?: string | null) => lineItem?.split(', ')[0]?.trim() || '';

/** Billed dollars from OpenAI's organization Costs API, which needs an Admin API key */
export function createOpenAIBilling({
  apiKey,
  fetch: fetchImpl = fetch,
  baseURL = 'https://api.openai.com/v1',
  timeoutMs = BILLING_TIMEOUT_MS,
}: BillingSourceOptions): BillingSource {
  return {
    provider: 'openai',
    async fetchCosts({ from, to }) {
      const lines: BilledLines = new Map();
      const fetchPage = async (cursor: string | null) => {
        const query = new URLSearchParams({
          start_time: String(Math.floor(from.getTime() / 1000)),
          end_time: String(Math.floor(to.getTime() / 1000)),
          bucket_width: '1d',
          group_by: 'line_item',
          limit: '180',
          ...(cursor ? { page: cursor } : {}),
        });
        const response = await fetchImpl(`${baseURL}/organization/costs?${query}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        return readJson<CostsPage>(response);
      };
      await eachPage(fetchPage, (body) => {
        for (const bucket of body.data) {
          for (const result of bucket.results) {
            addCost(lines, lineName(result.line_item), Number(result.amount?.value ?? 0));
          }
        }
      });
      return lines;
    },
  };
}
