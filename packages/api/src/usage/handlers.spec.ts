import type { TUsageResponse } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createUsageHandler } from './handlers';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
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
