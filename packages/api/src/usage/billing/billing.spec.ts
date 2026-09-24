import type { BillingFetch } from './source';
import { createAnthropicBilling } from './anthropic';
import { createOpenAIBilling } from './openai';
import { billingWindow } from './source';

const window = billingWindow(
  new Date('2026-09-01T03:00:00.000Z'),
  new Date('2026-09-02T15:30:00.000Z'),
);

/** Serves each page in order and records the URLs and headers it was asked for */
function pagedFetch(pages: unknown[], status = 200) {
  const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
  const fetchImpl: BillingFetch = async (url, init) => {
    calls.push({ url: new URL(url), headers: init.headers as Record<string, string> });
    const body = pages[calls.length - 1] ?? pages[pages.length - 1];
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

describe('billingWindow', () => {
  it('widens a window to whole UTC days', () => {
    expect(window.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });
});

describe('createOpenAIBilling', () => {
  it('sums dollars per model across buckets and pages', async () => {
    const { fetchImpl, calls } = pagedFetch([
      {
        data: [
          {
            results: [
              { amount: { value: 1.5, currency: 'usd' }, line_item: 'gpt-5, input_tokens' },
              { amount: { value: 2, currency: 'usd' }, line_item: 'gpt-5, output_tokens' },
            ],
          },
        ],
        has_more: true,
        next_page: 'page_2',
      },
      {
        data: [
          {
            results: [
              { amount: { value: '0.25', currency: 'usd' }, line_item: 'web search tool calls' },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      },
    ]);

    const lines = await createOpenAIBilling({ apiKey: 'sk-admin', fetch: fetchImpl }).fetchCosts(
      window,
    );

    expect([...lines]).toEqual([
      ['gpt-5', 3.5],
      ['web search tool calls', 0.25],
    ]);
    expect(calls[0].url.pathname).toBe('/v1/organization/costs');
    expect(calls[0].url.searchParams.get('start_time')).toBe('1788220800');
    expect(calls[0].url.searchParams.get('end_time')).toBe('1788393600');
    expect(calls[0].url.searchParams.get('group_by')).toBe('line_item');
    expect(calls[0].headers.Authorization).toBe('Bearer sk-admin');
    expect(calls[1].url.searchParams.get('page')).toBe('page_2');
  });

  it('reports a rejected admin key as an auth error', async () => {
    const { fetchImpl } = pagedFetch([{ error: { message: 'bad key' } }], 401);

    await expect(
      createOpenAIBilling({ apiKey: 'sk-wrong', fetch: fetchImpl }).fetchCosts(window),
    ).rejects.toMatchObject({ code: 'auth', status: 401 });
  });
});

describe('createAnthropicBilling', () => {
  it('converts cents to dollars and groups by model, then by description', async () => {
    const { fetchImpl, calls } = pagedFetch([
      {
        data: [
          {
            starting_at: '2026-09-01T00:00:00Z',
            ending_at: '2026-09-02T00:00:00Z',
            results: [
              { amount: '123.45', currency: 'USD', model: 'claude-opus-5', description: 'x' },
              { amount: '76.55', currency: 'USD', model: 'claude-opus-5', description: 'y' },
              { amount: '10', currency: 'USD', model: null, description: 'Code Execution Usage' },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      },
    ]);

    const lines = await createAnthropicBilling({
      apiKey: 'sk-ant-admin01',
      fetch: fetchImpl,
    }).fetchCosts(window);

    expect(lines.get('claude-opus-5')).toBeCloseTo(2);
    expect(lines.get('Code Execution Usage')).toBeCloseTo(0.1);
    expect(calls[0].url.pathname).toBe('/v1/organizations/cost_report');
    expect(calls[0].url.searchParams.get('starting_at')).toBe('2026-09-01T00:00:00.000Z');
    expect(calls[0].url.searchParams.get('group_by[]')).toBe('description');
    expect(calls[0].headers['x-api-key']).toBe('sk-ant-admin01');
    expect(calls[0].headers['anthropic-version']).toBe('2023-06-01');
  });

  it('reports throttling as a rate limit error', async () => {
    const { fetchImpl } = pagedFetch([{}], 429);

    await expect(
      createAnthropicBilling({ apiKey: 'sk-ant-admin01', fetch: fetchImpl }).fetchCosts(window),
    ).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('stops following a cursor that never ends', async () => {
    const { fetchImpl, calls } = pagedFetch([{ data: [], has_more: true, next_page: 'again' }]);

    await createAnthropicBilling({ apiKey: 'k', fetch: fetchImpl }).fetchCosts(window);

    expect(calls).toHaveLength(24);
  });
});
