import type { TUsageProvider } from 'librechat-data-provider';
import type { BillingSource } from './source';
import { createAnthropicBilling } from './anthropic';
import { createOpenAIBilling } from './openai';

type BillingEnv = Partial<
  Record<
    'OPENAI_ADMIN_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_ADMIN_KEY' | 'ANTHROPIC_API_KEY',
    string
  >
>;

/** Set when a chat key must come from each user rather than the server */
const USER_PROVIDED = 'user_provided';

function pickKey(adminKey?: string, chatKey?: string) {
  if (adminKey) {
    return { apiKey: adminKey, usesChatKey: false };
  }
  if (chatKey && chatKey !== USER_PROVIDED) {
    return { apiKey: chatKey, usesChatKey: true };
  }
  return undefined;
}

/**
 * Builds a billing source per provider from the server's keys. An admin key
 * wins; without one the chat key is tried, so an organization key that also
 * reads costs needs no second variable — and one that cannot is reported as
 * needing an admin key rather than as a broken key.
 */
export function createBillingSources(
  env: BillingEnv,
): Partial<Record<TUsageProvider, BillingSource>> {
  const openai = pickKey(env.OPENAI_ADMIN_KEY, env.OPENAI_API_KEY);
  const anthropic = pickKey(env.ANTHROPIC_ADMIN_KEY, env.ANTHROPIC_API_KEY);
  return {
    ...(openai
      ? {
          openai: {
            ...createOpenAIBilling({ apiKey: openai.apiKey }),
            usesChatKey: openai.usesChatKey,
          },
        }
      : {}),
    ...(anthropic
      ? {
          anthropic: {
            ...createAnthropicBilling({ apiKey: anthropic.apiKey }),
            usesChatKey: anthropic.usesChatKey,
          },
        }
      : {}),
  };
}
