import { logger } from '@librechat/data-schemas';
import { USAGE_MAX_RANGE_DAYS } from 'librechat-data-provider';
import type { UsageMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

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
