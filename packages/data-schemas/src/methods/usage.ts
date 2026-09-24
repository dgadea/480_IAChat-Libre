import {
  isEphemeralAgentId,
  stripAgentIdSuffix,
  USAGE_CREDITS_PER_USD,
} from 'librechat-data-provider';
import type {
  TUsageAgent,
  TUsageModel,
  TUsageResponse,
  TUsageTotals,
  TUsageUser,
} from 'librechat-data-provider';
import type { Model, Types } from 'mongoose';
import type { ITransaction } from '~/schema/transaction';
import type { IAgent, IMessage, IUser } from '~/types';

export type UsageOptions = {
  from: Date;
  to: Date;
  tenantId?: string;
};

export type UsageMethods = {
  getUsage: (options: UsageOptions) => Promise<TUsageResponse>;
};

type UsageGroup = {
  _id: {
    user: Types.ObjectId;
    model: string | null;
    tokenType: 'prompt' | 'completion';
    messageId: string | null;
  };
  tokens: number;
  credits: number;
  count: number;
};

type UserSummary = Pick<IUser, 'name' | 'username' | 'email'> & { _id: Types.ObjectId };
type MessageSummary = Pick<IMessage, 'messageId' | 'user' | 'model'>;
type AgentSummary = Pick<IAgent, 'id' | 'name'>;

/** Credits stay whole while summing, so dollars are divided out once per row */
type Tally = Omit<TUsageTotals, 'cost'> & { credits: number };
type UserTally = { totals: Tally; models: Map<string, Tally> };
type AgentTally = { totals: Tally; users: Map<string, UserTally> };

/** Keeps each `$in` list well under the server's document size limit */
const messageBatchSize = 5000;

const emptyTally = (): Tally => ({
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  credits: 0,
});

const emptyUserTally = (): UserTally => ({ totals: emptyTally(), models: new Map() });
const emptyAgentTally = (): AgentTally => ({ totals: emptyTally(), users: new Map() });

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

function addUserGroup(user: UserTally, model: string, group: UsageGroup): void {
  addGroup(user.totals, group);
  addGroup(entry(user.models, model, emptyTally), group);
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

/** Transactions carry the response's messageId; an agent's response stores the agent id as its model */
const responseKey = (userId: string, messageId: string) => `${userId}\u0000${messageId}`;

function agentOf(model: string | null | undefined): string {
  return model && !isEphemeralAgentId(model) ? stripAgentIdSuffix(model) : '';
}

export function createUsageMethods(mongoose: typeof import('mongoose')): UsageMethods {
  const Transaction = () => mongoose.models.Transaction as Model<ITransaction>;
  const Message = () => mongoose.models.Message as Model<IMessage>;
  const Agent = () => mongoose.models.Agent as Model<IAgent>;
  const User = () => mongoose.models.User as Model<IUser>;

  /** Which saved agent produced each response, keyed by owner and messageId */
  async function findResponseAgents(messageIds: string[]): Promise<Map<string, string>> {
    const agents = new Map<string, string>();
    for (let start = 0; start < messageIds.length; start += messageBatchSize) {
      const messages = await Message()
        .find(
          { messageId: { $in: messageIds.slice(start, start + messageBatchSize) } },
          { _id: 0, messageId: 1, user: 1, model: 1 },
        )
        .lean<MessageSummary[]>();
      for (const message of messages) {
        const agentId = agentOf(message.model);
        if (agentId && message.user) {
          agents.set(responseKey(message.user, message.messageId), agentId);
        }
      }
    }
    return agents;
  }

  /** Spend per user, model and agent over a window, from the prompt and completion transactions */
  async function getUsage({ from, to, tenantId }: UsageOptions): Promise<TUsageResponse> {
    const groups = await Transaction().aggregate<UsageGroup>([
      {
        $match: {
          ...tenantMatch(tenantId),
          createdAt: { $gte: from, $lte: to },
          tokenType: { $in: ['prompt', 'completion'] },
        },
      },
      {
        $group: {
          _id: {
            user: '$user',
            model: '$model',
            tokenType: '$tokenType',
            messageId: '$messageId',
          },
          tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
          credits: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
          count: { $sum: 1 },
        },
      },
    ]);

    const messageIds = [
      ...new Set(groups.map((group) => group._id.messageId).filter((id): id is string => !!id)),
    ];
    const responseAgents = await findResponseAgents(messageIds);

    const summary = emptyTally();
    const models = new Map<string, Tally>();
    const users = new Map<string, UserTally>();
    const agents = new Map<string, AgentTally>();
    for (const group of groups) {
      const model = group._id.model || '';
      const userId = group._id.user.toString();
      const messageId = group._id.messageId;
      const agentId = messageId ? (responseAgents.get(responseKey(userId, messageId)) ?? '') : '';
      const agent = entry(agents, agentId, emptyAgentTally);
      addGroup(summary, group);
      addGroup(entry(models, model, emptyTally), group);
      addUserGroup(entry(users, userId, emptyUserTally), model, group);
      addGroup(agent.totals, group);
      addUserGroup(entry(agent.users, userId, emptyUserTally), model, group);
    }

    const agentIds = [...agents.keys()].filter(Boolean);
    const [profiles, agentProfiles] = await Promise.all([
      User()
        .find({ _id: { $in: [...users.keys()] } }, { name: 1, username: 1, email: 1 })
        .lean<UserSummary[]>(),
      agentIds.length > 0
        ? Agent()
            .find({ id: { $in: agentIds } }, { _id: 0, id: 1, name: 1 })
            .lean<AgentSummary[]>()
        : Promise.resolve<AgentSummary[]>([]),
    ]);
    const profileById = new Map(profiles.map((profile) => [profile._id.toString(), profile]));
    const agentNames = new Map(agentProfiles.map((agent) => [agent.id, agent.name ?? '']));

    const toUsers = (tallies: Map<string, UserTally>): TUsageUser[] =>
      [...tallies]
        .map(([userId, user]) => {
          const profile = profileById.get(userId);
          return {
            userId,
            name: profile?.name || profile?.username || '',
            email: profile?.email ?? '',
            ...toTotals(user.totals),
            models: toModels(user.models),
          };
        })
        .sort(byCost);

    const agentRows: TUsageAgent[] = [...agents]
      .map(([agentId, agent]) => ({
        agentId,
        name: agentNames.get(agentId)?.trim() || '',
        ...toTotals(agent.totals),
        users: toUsers(agent.users),
      }))
      .sort(byCost);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      summary: { ...toTotals(summary), users: users.size },
      users: toUsers(users),
      models: toModels(models),
      agents: agentRows,
    };
  }

  return { getUsage };
}
