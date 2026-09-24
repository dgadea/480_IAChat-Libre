import type { TUsageResponse } from 'librechat-data-provider';
import type { Response } from 'express';
import type { BillingSource } from './billing';
import type { ServerRequest } from '~/types';
import { createProviderBillingHandler, createUsageHandler } from './handlers';
import { BillingError } from './billing';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

const emptyUsage: TUsageResponse = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-09-20T00:00:00.000Z',
  summary: { users: 0, requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
  users: [],
  models: [],
};

const createResponse = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { response: { status, json } as Partial<Response> as Response, status, json };
};

const createRequest = (query: ServerRequest['query'], tenantId?: string): ServerRequest =>
  ({ query, user: { id: 'admin-id', role: 'ADMIN', tenantId } }) as ServerRequest;

describe('createUsageHandler', () => {
  it('loads usage for the requested window and the admin tenant', async () => {
    const getUsage = jest.fn().mockResolvedValue(emptyUsage);
    const { response, json } = createResponse();

    await createUsageHandler({ getUsage })(
      createRequest(
        { fromTimestamp: '2026-09-01T00:00:00.000Z', toTimestamp: '2026-09-20T00:00:00.000Z' },
        'tenant-a',
      ),
      response,
    );

    expect(getUsage).toHaveBeenCalledWith({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-20T00:00:00.000Z'),
      tenantId: 'tenant-a',
    });
    expect(json).toHaveBeenCalledWith(emptyUsage);
  });

  it.each([
    ['missing dates', {}],
    ['an unparseable date', { fromTimestamp: 'yesterday', toTimestamp: '2026-09-20T00:00:00Z' }],
    [
      'a reversed range',
      { fromTimestamp: '2026-09-20T00:00:00Z', toTimestamp: '2026-09-01T00:00:00Z' },
    ],
    [
      'a range over a year',
      { fromTimestamp: '2025-01-01T00:00:00Z', toTimestamp: '2026-09-20T00:00:00Z' },
    ],
  ])('rejects %s without querying', async (_label, query) => {
    const getUsage = jest.fn();
    const { response, status } = createResponse();

    await createUsageHandler({ getUsage })(createRequest(query), response);

    expect(status).toHaveBeenCalledWith(400);
    expect(getUsage).not.toHaveBeenCalled();
  });

  it('answers 500 when the query fails', async () => {
    const getUsage = jest.fn().mockRejectedValue(new Error('down'));
    const { response, status } = createResponse();

    await createUsageHandler({ getUsage })(
      createRequest({ fromTimestamp: '2026-09-01T00:00:00Z', toTimestamp: '2026-09-02T00:00:00Z' }),
      response,
    );

    expect(status).toHaveBeenCalledWith(500);
  });
});

describe('createProviderBillingHandler', () => {
  const query = { fromTimestamp: '2026-09-01T10:00:00Z', toTimestamp: '2026-09-02T10:00:00Z' };

  it('reads configured providers over whole UTC days and marks the rest unconfigured', async () => {
    const openai: BillingSource = {
      provider: 'openai',
      fetchCosts: jest.fn().mockResolvedValue(
        new Map([
          ['gpt-5-mini', 0.1],
          ['gpt-5', 3.3333333333],
        ]),
      ),
    };
    const { response, json } = createResponse();

    await createProviderBillingHandler({ sources: { openai } })(createRequest(query), response);

    expect(openai.fetchCosts).toHaveBeenCalledWith({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
    });
    expect(json).toHaveBeenCalledWith({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-03T00:00:00.000Z',
      providers: [
        {
          provider: 'openai',
          configured: true,
          cost: 3.433333,
          lines: [
            { name: 'gpt-5', cost: 3.333333 },
            { name: 'gpt-5-mini', cost: 0.1 },
          ],
        },
        { provider: 'anthropic', configured: false, cost: 0, lines: [] },
      ],
    });
  });

  it('keeps answering when one provider fails, naming why', async () => {
    const anthropic: BillingSource = {
      provider: 'anthropic',
      fetchCosts: jest.fn().mockRejectedValue(new BillingError('auth', 401)),
    };
    const openai: BillingSource = {
      provider: 'openai',
      fetchCosts: jest.fn().mockRejectedValue(new Error('socket hang up')),
    };
    const { response, json } = createResponse();

    await createProviderBillingHandler({ sources: { openai, anthropic } })(
      createRequest(query),
      response,
    );

    const { providers } = json.mock.calls[0][0];
    expect(providers.map((p: { error?: string }) => p.error)).toEqual(['failed', 'auth']);
  });

  it('rejects an invalid window without calling providers', async () => {
    const openai: BillingSource = { provider: 'openai', fetchCosts: jest.fn() };
    const { response, status } = createResponse();

    await createProviderBillingHandler({ sources: { openai } })(createRequest({}), response);

    expect(status).toHaveBeenCalledWith(400);
    expect(openai.fetchCosts).not.toHaveBeenCalled();
  });
});
