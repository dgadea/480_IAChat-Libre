import { USAGE_CREDITS_PER_USD } from 'librechat-data-provider';
import type {
  TUsageModel,
  TUsageResponse,
  TUsageTotals,
  TUsageUser,
} from 'librechat-data-provider';
import type { Model, Types } from 'mongoose';
import type { ITransaction } from '~/schema/transaction';
import type { IUser } from '~/types';

export type UsageOptions = {
  from: Date;
  to: Date;
  tenantId?: string;
};

export type UsageMethods = {
  getUsage: (options: UsageOptions) => Promise<TUsageResponse>;
};

type UsageGroup = {
  _id: { user: Types.ObjectId; model: string | null; tokenType: 'prompt' | 'completion' };
  tokens: number;
  credits: number;
  count: number;
};

type UserSummary = Pick<IUser, 'name' | 'username' | 'email'> & { _id: Types.ObjectId };

/** Credits stay whole while summing, so dollars are divided out once per row */
type Tally = Omit<TUsageTotals, 'cost'> & { credits: number };
type UserTally = { totals: Tally; models: Map<string, Tally> };

const emptyTally = (): Tally => ({
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  credits: 0,
});

function tenantMatch(tenantId?: string) {
  return tenantId ? { tenantId } : { tenantId: { $exists: false } };
}

function addGroup(tally: Tally, group: UsageGroup): void {
  const isPrompt = group._id.tokenType === 'prompt';
  tally.requests += isPrompt ? group.count : 0;
  tally.inputTokens += isPrompt ? group.tokens : 0;
  tally.outputTokens += isPrompt ? 0 : group.tokens;
  tally.totalTokens += group.tokens;
  tally.credits += group.credits;
}

function entry<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = create();
  map.set(key, created);
  return created;
}

const byCost = <T extends TUsageTotals>(a: T, b: T) =>
  b.cost - a.cost || b.totalTokens - a.totalTokens;

const toTotals = ({ credits, ...tally }: Tally): TUsageTotals => ({
  ...tally,
  cost: credits / USAGE_CREDITS_PER_USD,
});

const toModels = (models: Map<string, Tally>): TUsageModel[] =>
  [...models].map(([model, tally]) => ({ model, ...toTotals(tally) })).sort(byCost);

export function createUsageMethods(mongoose: typeof import('mongoose')): UsageMethods {
  /** Spend per user and model over a window, from the prompt and completion transactions */
  async function getUsage({ from, to, tenantId }: UsageOptions): Promise<TUsageResponse> {
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const User = mongoose.models.User as Model<IUser>;

    const groups = await Transaction.aggregate<UsageGroup>([
      {
        $match: {
          ...tenantMatch(tenantId),
          createdAt: { $gte: from, $lte: to },
          tokenType: { $in: ['prompt', 'completion'] },
        },
      },
      {
        $group: {
          _id: { user: '$user', model: '$model', tokenType: '$tokenType' },
          tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
          credits: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = emptyTally();
    const models = new Map<string, Tally>();
    const users = new Map<string, UserTally>();
    for (const group of groups) {
      const model = group._id.model || '';
      const user = entry(users, group._id.user.toString(), () => ({
        totals: emptyTally(),
        models: new Map(),
      }));
      addGroup(summary, group);
      addGroup(entry(models, model, emptyTally), group);
      addGroup(user.totals, group);
      addGroup(entry(user.models, model, emptyTally), group);
    }

    const profiles = await User.find(
      { _id: { $in: [...users.keys()] } },
      { name: 1, username: 1, email: 1 },
    ).lean<UserSummary[]>();
    const profileById = new Map(profiles.map((profile) => [profile._id.toString(), profile]));

    const userRows: TUsageUser[] = [...users].map(([userId, user]) => {
      const profile = profileById.get(userId);
      return {
        userId,
        name: profile?.name || profile?.username || '',
        email: profile?.email ?? '',
        ...toTotals(user.totals),
        models: toModels(user.models),
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      summary: { ...toTotals(summary), users: users.size },
      users: userRows.sort(byCost),
      models: toModels(models),
    };
  }

  return { getUsage };
}
