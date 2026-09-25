import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ITransaction } from '~/schema/transaction';
import { createTxMethods, tokenValues, cacheTokenValues } from './tx';
import { matchModelName, findMatchingPattern } from './test-helpers';
import { createTransactionMethods } from './transaction';
import { createSpendTokensMethods } from './spendTokens';
import { createModelPriceMethods } from './modelPrice';
import { createModels } from '~/models';

let mongoServer: InstanceType<typeof MongoMemoryServer>;

const prices = createModelPriceMethods(mongoose);
const tx = createTxMethods(mongoose, {
  matchModelName,
  findMatchingPattern,
  getPriceOverride: prices.getModelPriceOverride,
});
const transactions = createTransactionMethods(mongoose, {
  getMultiplier: tx.getMultiplier,
  getCacheMultiplier: tx.getCacheMultiplier,
});
const { spendTokens, spendStructuredTokens } = createSpendTokensMethods(mongoose, {
  createTransaction: transactions.createTransaction,
  createStructuredTransaction: transactions.createStructuredTransaction,
});

const user = new mongoose.Types.ObjectId().toString();
const txData = {
  user,
  conversationId: 'convo-1',
  context: 'message',
  transactions: { enabled: true },
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  await mongoose.models.ModelPrice.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    mongoose.models.ModelPrice.deleteMany({}),
    mongoose.models.Transaction.deleteMany({}),
  ]);
  await prices.refreshModelPrices();
});

const recorded = () =>
  mongoose.models.Transaction.find({}).sort({ tokenType: -1 }).lean<ITransaction[]>();

describe('model price overrides', () => {
  it('prices new calls at the edited rate instead of the built-in table', async () => {
    await prices.upsertModelPrice({ model: 'gpt-5', prompt: 2, completion: 20 });

    await spendTokens({ ...txData, model: 'gpt-5' }, { promptTokens: 1000, completionTokens: 500 });

    const [prompt, completion] = await recorded();
    expect(prompt).toMatchObject({ tokenType: 'prompt', rate: 2, tokenValue: -2000 });
    expect(completion).toMatchObject({ tokenType: 'completion', rate: 20, tokenValue: -10_000 });
  });

  it('leaves spend recorded before the edit at the rate it was priced at', async () => {
    await spendTokens({ ...txData, model: 'gpt-5' }, { promptTokens: 1000, completionTokens: 0 });
    await prices.upsertModelPrice({ model: 'gpt-5', prompt: 99, completion: 99 });

    const [prompt] = await recorded();
    expect(prompt.rate).toBe(tokenValues['gpt-5'].prompt);
  });

  it('matches the exact model name only', async () => {
    await prices.upsertModelPrice({ model: 'gpt-5', prompt: 2, completion: 20 });

    expect(tx.getMultiplier({ model: 'gpt-5-mini', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5-mini'].prompt,
    );
  });

  it('wins over an endpoint token config', async () => {
    await prices.upsertModelPrice({ model: 'grok-4.3', prompt: 1, completion: 4 });

    expect(
      tx.getMultiplier({
        model: 'grok-4.3',
        tokenType: 'completion',
        endpointTokenConfig: { 'grok-4.3': { prompt: 9, completion: 9 } },
      }),
    ).toBe(4);
  });

  it('keeps a rate the caller priced under another value key', async () => {
    await prices.upsertModelPrice({ model: 'gemini-omni-1.1-flash', prompt: 1, completion: 30 });

    expect(
      tx.getMultiplier({
        model: 'gemini-omni-1.1-flash',
        valueKey: 'gemini-omni-text',
        tokenType: 'completion',
      }),
    ).toBe(tokenValues['gemini-omni-text'].completion);
    expect(
      tx.getMultiplier({
        model: 'gemini-omni-1.1-flash',
        valueKey: 'gemini-omni',
        tokenType: 'completion',
      }),
    ).toBe(30);
  });

  it('uses edited cache rates, and the table ones when left blank', async () => {
    await prices.upsertModelPrice({ model: 'claude-sonnet-5', prompt: 4, completion: 8 });
    expect(tx.getCacheMultiplier({ model: 'claude-sonnet-5', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-sonnet-5'].read,
    );

    await prices.upsertModelPrice({
      model: 'claude-sonnet-5',
      prompt: 4,
      completion: 8,
      cacheWrite: 5,
      cacheRead: 0.5,
    });
    await spendStructuredTokens(
      { ...txData, model: 'claude-sonnet-5' },
      {
        promptTokens: { input: 100, write: 200, read: 1000 },
        completionTokens: 10,
      },
    );

    const [prompt] = await recorded();
    expect(prompt.tokenValue).toBe(-(100 * 4 + 200 * 5 + 1000 * 0.5));
  });

  it('drops the override on reset and when a cache rate is cleared', async () => {
    await prices.upsertModelPrice({
      model: 'gpt-5',
      prompt: 2,
      completion: 20,
      cacheRead: 0.1,
    });
    await prices.upsertModelPrice({ model: 'gpt-5', prompt: 2, completion: 20 });
    expect(await prices.listModelPrices()).toEqual([{ model: 'gpt-5', prompt: 2, completion: 20 }]);

    expect(await prices.deleteModelPrice('gpt-5')).toBe(true);
    expect(prices.getModelPriceOverride('gpt-5')).toBeUndefined();
    expect(tx.getMultiplier({ model: 'gpt-5', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-5'].prompt,
    );
  });

  it('picks up an edit another instance saved once its copy is refreshed', async () => {
    const otherInstance = createModelPriceMethods(mongoose);
    await otherInstance.upsertModelPrice({ model: 'gpt-5', prompt: 3, completion: 30 });
    expect(prices.getModelPriceOverride('gpt-5')).toBeUndefined();

    await prices.refreshModelPrices();

    expect(prices.getModelPriceOverride('gpt-5')).toEqual({ prompt: 3, completion: 30 });
  });
});
