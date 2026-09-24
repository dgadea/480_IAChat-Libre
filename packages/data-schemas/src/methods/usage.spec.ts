import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createTransactionModel } from '../models/transaction';
import { createUserModel } from '../models/user';
import { createUsageMethods } from './usage';

let mongoServer: MongoMemoryServer;
const { getUsage } = createUsageMethods(mongoose);

const dayMs = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-20T12:00:00Z');
const window = { from: new Date(now.getTime() - 7 * dayMs), to: now };

const spend = (document: Record<string, unknown>) => ({
  createdAt: new Date(now.getTime() - dayMs),
  ...document,
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([createTransactionModel(mongoose).init(), createUserModel(mongoose).init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    mongoose.models.Transaction.deleteMany({}),
    mongoose.models.User.deleteMany({}),
  ]);
});

describe('Usage methods', () => {
  it('totals tokens, calls and dollars per user and model, most expensive first', async () => {
    const ana = new mongoose.Types.ObjectId();
    const bruno = new mongoose.Types.ObjectId();
    await mongoose.models.User.collection.insertMany([
      { _id: ana, name: 'Ana', email: 'ana@example.com' },
      { _id: bruno, username: 'bruno', email: 'bruno@example.com' },
    ]);
    await mongoose.models.Transaction.collection.insertMany([
      spend({
        user: ana,
        model: 'gpt-5',
        tokenType: 'prompt',
        rawAmount: -1000,
        tokenValue: -2_000_000,
      }),
      spend({
        user: ana,
        model: 'gpt-5',
        tokenType: 'completion',
        rawAmount: -500,
        tokenValue: -3_000_000,
      }),
      spend({
        user: ana,
        model: 'gemini',
        tokenType: 'prompt',
        rawAmount: -200,
        tokenValue: -100_000,
      }),
      spend({
        user: bruno,
        model: 'gemini',
        tokenType: 'prompt',
        rawAmount: -300,
        tokenValue: -150_000,
      }),
      spend({
        user: bruno,
        model: 'gemini',
        tokenType: 'completion',
        rawAmount: -100,
        tokenValue: -50_000,
      }),
      spend({ user: bruno, tokenType: 'credits', rawAmount: 10_000_000, tokenValue: 10_000_000 }),
    ]);

    const usage = await getUsage(window);

    expect(usage.summary).toEqual({
      users: 2,
      requests: 3,
      inputTokens: 1500,
      outputTokens: 600,
      totalTokens: 2100,
      cost: 5.3,
    });
    expect(usage.users.map((user) => [user.name, user.email, user.cost])).toEqual([
      ['Ana', 'ana@example.com', 5.1],
      ['bruno', 'bruno@example.com', 0.2],
    ]);
    expect(usage.users[0].models).toEqual([
      {
        model: 'gpt-5',
        requests: 1,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        cost: 5,
      },
      {
        model: 'gemini',
        requests: 1,
        inputTokens: 200,
        outputTokens: 0,
        totalTokens: 200,
        cost: 0.1,
      },
    ]);
    expect(usage.models.map((model) => [model.model, model.requests, model.totalTokens])).toEqual([
      ['gpt-5', 1, 1500],
      ['gemini', 2, 600],
    ]);
  });

  it('leaves out spend outside the window and from another tenant', async () => {
    const user = new mongoose.Types.ObjectId();
    await mongoose.models.Transaction.collection.insertMany([
      spend({ user, model: 'gpt-5', tokenType: 'prompt', rawAmount: -10, tokenValue: -10 }),
      spend({
        user,
        model: 'gpt-5',
        tokenType: 'prompt',
        rawAmount: -99,
        tokenValue: -99,
        createdAt: new Date(now.getTime() - 30 * dayMs),
      }),
      spend({
        user,
        model: 'gpt-5',
        tokenType: 'prompt',
        rawAmount: -77,
        tokenValue: -77,
        tenantId: 't2',
      }),
    ]);

    const usage = await getUsage(window);

    expect(usage.summary.totalTokens).toBe(10);
    expect(usage.users).toHaveLength(1);
    expect(usage.users[0].name).toBe('');
  });

  it('returns empty totals when nothing was spent', async () => {
    const usage = await getUsage(window);

    expect(usage.summary).toEqual({
      users: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
    });
    expect(usage.users).toEqual([]);
    expect(usage.models).toEqual([]);
  });
});
