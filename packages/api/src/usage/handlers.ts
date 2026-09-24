import { logger } from '@librechat/data-schemas';
import { USAGE_MAX_RANGE_DAYS } from 'librechat-data-provider';
import type {
  TProviderBilling,
  TUsageProvider,
  TProviderBillingResponse,
} from 'librechat-data-provider';
import type { UsageMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { BillingSource, BillingWindow } from './billing';
import type { ServerRequest } from '~/types';
import { BillingError, billingWindow } from './billing';

type UsageHandlerDeps = {
  getUsage: UsageMethods['getUsage'];
};

type UsageWindow = { from: Date; to: Date };

const dayMs = 24 * 60 * 60 * 1000;

const timestamp = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

/** Reads the requested window, or undefined when it is missing, reversed or too wide */
export function parseUsageWindow(query: ServerRequest['query']): UsageWindow | undefined {
  const from = timestamp(query.fromTimestamp);
  const to = timestamp(query.toTimestamp);
  if (!from || !to || from > to) {
    return undefined;
  }
  if (to.getTime() - from.getTime() > USAGE_MAX_RANGE_DAYS * dayMs) {
    return undefined;
  }
  return { from, to };
}

export function createUsageHandler({ getUsage }: UsageHandlerDeps) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    try {
      const window = parseUsageWindow(req.query);
      if (!window) {
        res.status(400).json({ message: 'Invalid date range' });
        return;
      }
      const tenantId = req.user?.tenantId || undefined;
      res.json(await getUsage({ ...window, tenantId }));
    } catch (error) {
      logger.error('[Usage] Failed to load usage', error);
      res.status(500).json({ message: 'Failed to load usage' });
    }
  };
}

type ProviderBillingHandlerDeps = {
  /** Sources for the providers whose admin key is set; the rest report as unconfigured */
  sources: Partial<Record<TUsageProvider, BillingSource>>;
};

const usageProviders: TUsageProvider[] = ['openai', 'anthropic'];

const roundCents = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

async function readProvider(
  provider: TUsageProvider,
  source: BillingSource | undefined,
  window: BillingWindow,
): Promise<TProviderBilling> {
  if (!source) {
    return { provider, configured: false, cost: 0, lines: [] };
  }
  try {
    const billed = await source.fetchCosts(window);
    const lines = [...billed]
      .map(([name, cost]) => ({ name, cost: roundCents(cost) }))
      .sort((a, b) => b.cost - a.cost);
    const cost = roundCents(lines.reduce((sum, line) => sum + line.cost, 0));
    return { provider, configured: true, cost, lines };
  } catch (error) {
    logger.warn(`[Usage] Could not read ${provider} billing`, error);
    const code = error instanceof BillingError ? error.code : 'failed';
    return { provider, configured: true, cost: 0, lines: [], error: code };
  }
}

/** What each provider actually billed over the window, read with their admin keys */
export function createProviderBillingHandler({ sources }: ProviderBillingHandlerDeps) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    const requested = parseUsageWindow(req.query);
    if (!requested) {
      res.status(400).json({ message: 'Invalid date range' });
      return;
    }
    const window = billingWindow(requested.from, requested.to);
    const providers = await Promise.all(
      usageProviders.map((provider) => readProvider(provider, sources[provider], window)),
    );
    const body: TProviderBillingResponse = {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      providers,
    };
    res.json(body);
  };
}
