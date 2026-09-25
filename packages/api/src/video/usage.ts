import { logger } from '@librechat/data-schemas';
import type { TCustomConfig, TTransactionsConfig } from 'librechat-data-provider';
import type { VideoUsage } from './types';

export type VideoSpendData = {
  user: string;
  model: string;
  conversationId: string;
  messageId?: string;
  context: string;
  valueKey?: string;
  balance?: Partial<TCustomConfig['balance']> | null;
  transactions?: Partial<TTransactionsConfig>;
};

export type VideoSpendTokens = (
  txData: VideoSpendData,
  tokenUsage: { promptTokens?: number; completionTokens?: number },
) => Promise<unknown>;

/**
 * Writes one generation's tokens as transactions, so a video is priced and
 * attributed to its user and agent like any model call. Output the provider
 * bills at another rate goes in as its own completion under that value key.
 */
export async function recordVideoUsage({
  usage,
  spendTokens,
  txData,
}: {
  usage?: VideoUsage;
  spendTokens: VideoSpendTokens;
  txData: Omit<VideoSpendData, 'context' | 'valueKey'>;
}): Promise<void> {
  if (!usage) {
    return;
  }
  if (!txData.balance?.enabled && txData.transactions?.enabled === false) {
    return;
  }
  const spend: VideoSpendData = { ...txData, context: 'video_generation' };
  try {
    await spendTokens(spend, {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
    });
    for (const other of usage.otherOutputs ?? []) {
      if (other.tokens > 0) {
        await spendTokens(
          { ...spend, valueKey: other.valueKey },
          { completionTokens: other.tokens },
        );
      }
    }
  } catch (error) {
    logger.error('[video] Failed to record generation usage', error);
  }
}
