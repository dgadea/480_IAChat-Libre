import { logger } from '@librechat/data-schemas';
import { MODEL_PRICE_MAX_RATE, MODEL_PRICE_MODEL_MAX_LENGTH } from 'librechat-data-provider';
import type {
  TModelPrice,
  TModelRates,
  TModelPriceRow,
  TModelPricesResponse,
} from 'librechat-data-provider';
import type { ModelPriceMethods, TxMethods } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

type ModelPricesDeps = Pick<
  ModelPriceMethods,
  'listModelPrices' | 'upsertModelPrice' | 'deleteModelPrice'
> &
  Pick<TxMethods, 'getValueKey' | 'tokenValues' | 'cacheTokenValues' | 'defaultRate'>;

/** Bounds one listing request; the page asks for the models it shows */
const maxRequestedModels = 200;

const modelName = (value: unknown): string | undefined => {
  const model = typeof value === 'string' ? value.trim() : '';
  return model && model.length <= MODEL_PRICE_MODEL_MAX_LENGTH ? model : undefined;
};

function rate(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= MODEL_PRICE_MAX_RATE
    ? parsed
    : undefined;
}

const isBlank = (value: unknown) => value == null || value === '';

/** Reads an edit from a request body, or undefined when any rate is missing or out of range */
export function parseModelPrice(body: unknown): TModelPrice | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const input = body as Record<keyof TModelPrice, unknown>;
  const model = modelName(input.model);
  const prompt = rate(input.prompt);
  const completion = rate(input.completion);
  const cacheWrite = rate(input.cacheWrite);
  const cacheRead = rate(input.cacheRead);
  const cacheInvalid =
    (!isBlank(input.cacheWrite) && cacheWrite == null) ||
    (!isBlank(input.cacheRead) && cacheRead == null);
  if (!model || prompt == null || completion == null || cacheInvalid) {
    return undefined;
  }
  return {
    model,
    prompt,
    completion,
    ...(cacheWrite != null ? { cacheWrite } : {}),
    ...(cacheRead != null ? { cacheRead } : {}),
  };
}

const requestedModels = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(modelName).filter((model): model is string => !!model))].slice(
    0,
    maxRequestedModels,
  );
};

export function createModelPricesHandlers(deps: ModelPricesDeps) {
  /** What the built-in tables charge a model, and which entry it matched */
  function basePrice(model: string): { base: TModelRates; baseKey?: string } {
    const key = deps.getValueKey(model);
    const rates = key ? deps.tokenValues[key] : undefined;
    if (!key || !rates) {
      return { base: { prompt: deps.defaultRate, completion: deps.defaultRate } };
    }
    const cache = deps.cacheTokenValues[key];
    return {
      baseKey: key,
      base: {
        prompt: rates.prompt,
        completion: rates.completion,
        ...(cache ? { cacheWrite: cache.write, cacheRead: cache.read } : {}),
      },
    };
  }

  function toRow(model: string, override?: TModelPrice): TModelPriceRow {
    const { base, baseKey } = basePrice(model);
    if (override) {
      const { model: _model, ...rates } = override;
      return { model, source: 'override', rates: { ...base, ...rates }, base, baseKey };
    }
    return { model, source: baseKey ? 'table' : 'default', rates: base, base, baseKey };
  }

  async function rowsFor(models: string[]): Promise<TModelPricesResponse> {
    const overrides = await deps.listModelPrices();
    const byModel = new Map(overrides.map((price) => [price.model, price]));
    const names = [...new Set([...models, ...byModel.keys()])].sort((a, b) => a.localeCompare(b));
    return { prices: names.map((model) => toRow(model, byModel.get(model))) };
  }

  return {
    /** Every requested model with its current rate, plus every model an admin has priced */
    async listPrices(req: ServerRequest, res: Response): Promise<void> {
      try {
        res.json(await rowsFor(requestedModels(req.query.models)));
      } catch (error) {
        logger.error('[Usage] Failed to list model prices', error);
        res.status(500).json({ message: 'Failed to load model prices' });
      }
    },

    async savePrice(req: ServerRequest, res: Response): Promise<void> {
      const price = parseModelPrice(req.body);
      if (!price) {
        res.status(400).json({ message: 'Invalid model price' });
        return;
      }
      try {
        const saved = await deps.upsertModelPrice(price, req.user?.id);
        res.json({ prices: [toRow(saved.model, saved)] });
      } catch (error) {
        logger.error('[Usage] Failed to save model price', error);
        res.status(500).json({ message: 'Failed to save model price' });
      }
    },

    async resetPrice(req: ServerRequest, res: Response): Promise<void> {
      const model = modelName(req.query.model);
      if (!model) {
        res.status(400).json({ message: 'Invalid model' });
        return;
      }
      try {
        await deps.deleteModelPrice(model);
        res.json({ prices: [toRow(model)] });
      } catch (error) {
        logger.error('[Usage] Failed to reset model price', error);
        res.status(500).json({ message: 'Failed to reset model price' });
      }
    },
  };
}
