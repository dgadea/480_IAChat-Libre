import type { TModelPrice } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createModelPricesHandlers, parseModelPrice } from './prices';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

const tokenValues = { 'gpt-5': { prompt: 1.25, completion: 10 } };
const cacheTokenValues = { 'gpt-5': { write: 1.25, read: 0.125 } };

function createDeps(overrides: TModelPrice[] = []) {
  return {
    listModelPrices: jest.fn().mockResolvedValue(overrides),
    upsertModelPrice: jest.fn(async (price: TModelPrice) => price),
    deleteModelPrice: jest.fn().mockResolvedValue(true),
    getValueKey: jest.fn((model: string) => (model.startsWith('gpt-5') ? 'gpt-5' : undefined)),
    tokenValues,
    cacheTokenValues,
    defaultRate: 6,
  };
}

const createResponse = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { response: { status, json } as Partial<Response> as Response, status, json };
};

const request = (fields: { query?: ServerRequest['query']; body?: unknown }): ServerRequest =>
  ({ query: {}, user: { id: 'admin-id' }, ...fields }) as ServerRequest;

describe('parseModelPrice', () => {
  it('accepts rates sent as numbers or numeric strings, and blank cache rates', () => {
    expect(
      parseModelPrice({
        model: ' gpt-5 ',
        prompt: '2',
        completion: 20,
        cacheWrite: '',
        cacheRead: null,
      }),
    ).toEqual({ model: 'gpt-5', prompt: 2, completion: 20 });
  });

  it.each([
    ['a missing model', { prompt: 1, completion: 1 }],
    ['a negative rate', { model: 'm', prompt: -1, completion: 1 }],
    ['a rate over the cap', { model: 'm', prompt: 1, completion: 1_000_000 }],
    ['text for a cache rate', { model: 'm', prompt: 1, completion: 1, cacheRead: 'cheap' }],
    ['no body', undefined],
  ])('rejects %s', (_label, body) => {
    expect(parseModelPrice(body)).toBeUndefined();
  });
});

describe('createModelPricesHandlers', () => {
  it('lists requested models with their source, and every edited model', async () => {
    const deps = createDeps([{ model: 'gemini-omni-1.1-flash', prompt: 1.5, completion: 17.5 }]);
    const { response, json } = createResponse();

    await createModelPricesHandlers(deps).listPrices(
      request({ query: { models: ['gpt-5', 'mystery-model'] } }),
      response,
    );

    expect(json.mock.calls[0][0].prices).toEqual([
      {
        model: 'gemini-omni-1.1-flash',
        source: 'override',
        rates: { prompt: 1.5, completion: 17.5 },
        base: { prompt: 6, completion: 6 },
      },
      {
        model: 'gpt-5',
        source: 'table',
        baseKey: 'gpt-5',
        rates: { prompt: 1.25, completion: 10, cacheWrite: 1.25, cacheRead: 0.125 },
        base: { prompt: 1.25, completion: 10, cacheWrite: 1.25, cacheRead: 0.125 },
      },
      {
        model: 'mystery-model',
        source: 'default',
        rates: { prompt: 6, completion: 6 },
        base: { prompt: 6, completion: 6 },
      },
    ]);
  });

  it('keeps table cache rates the edit left blank', async () => {
    const deps = createDeps();
    const { response, json } = createResponse();

    await createModelPricesHandlers(deps).savePrice(
      request({ body: { model: 'gpt-5', prompt: 2, completion: 20 } }),
      response,
    );

    expect(deps.upsertModelPrice).toHaveBeenCalledWith(
      { model: 'gpt-5', prompt: 2, completion: 20 },
      'admin-id',
    );
    expect(json.mock.calls[0][0].prices[0]).toMatchObject({
      source: 'override',
      rates: { prompt: 2, completion: 20, cacheWrite: 1.25, cacheRead: 0.125 },
    });
  });

  it('rejects an invalid edit without saving', async () => {
    const deps = createDeps();
    const { response, status } = createResponse();

    await createModelPricesHandlers(deps).savePrice(
      request({ body: { model: 'gpt-5' } }),
      response,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(deps.upsertModelPrice).not.toHaveBeenCalled();
  });

  it('resets a model back to the table rate', async () => {
    const deps = createDeps();
    const { response, json } = createResponse();

    await createModelPricesHandlers(deps).resetPrice(
      request({ query: { model: 'gpt-5' } }),
      response,
    );

    expect(deps.deleteModelPrice).toHaveBeenCalledWith('gpt-5');
    expect(json.mock.calls[0][0].prices[0]).toMatchObject({ model: 'gpt-5', source: 'table' });
  });
});
