import type { TModelPrice, TModelRates } from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { IModelPrice } from '~/schema/modelPrice';
import logger from '~/config/winston';

/** How long another instance's edit can go unseen before this one reloads */
const refreshAfterMs = 60_000;

export type ModelPriceMethods = {
  listModelPrices: () => Promise<TModelPrice[]>;
  upsertModelPrice: (price: TModelPrice, updatedBy?: string) => Promise<TModelPrice>;
  deleteModelPrice: (model: string) => Promise<boolean>;
  /** Loads every price into memory; runs at startup so the first call is priced correctly */
  refreshModelPrices: () => Promise<void>;
  /** The admin's rates for an exact model name, read from memory on every transaction */
  getModelPriceOverride: (model: string) => TModelRates | undefined;
};

type PriceDocument = Pick<
  IModelPrice,
  'model' | 'prompt' | 'completion' | 'cacheWrite' | 'cacheRead'
>;

const toPrice = ({
  model,
  prompt,
  completion,
  cacheWrite,
  cacheRead,
}: PriceDocument): TModelPrice => ({
  model,
  prompt,
  completion,
  ...(cacheWrite != null ? { cacheWrite } : {}),
  ...(cacheRead != null ? { cacheRead } : {}),
});

const priceFields = { _id: 0, model: 1, prompt: 1, completion: 1, cacheWrite: 1, cacheRead: 1 };

export function createModelPriceMethods(mongoose: typeof import('mongoose')): ModelPriceMethods {
  const ModelPrice = () => mongoose.models.ModelPrice as Model<IModelPrice>;
  let prices = new Map<string, TModelRates>();
  let loadedAt = 0;
  let loading: Promise<void> | null = null;

  async function listModelPrices(): Promise<TModelPrice[]> {
    const documents = await ModelPrice()
      .find({}, priceFields)
      .sort({ model: 1 })
      .lean<PriceDocument[]>();
    return documents.map(toPrice);
  }

  async function refreshModelPrices(): Promise<void> {
    if (loading) {
      return loading;
    }
    loading = listModelPrices()
      .then((list) => {
        prices = new Map(list.map(({ model, ...rates }) => [model, rates]));
        loadedAt = Date.now();
      })
      .catch((error) => {
        logger.error('[modelPrice] Could not load model prices', error);
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  async function upsertModelPrice(price: TModelPrice, updatedBy?: string): Promise<TModelPrice> {
    const { model, prompt, completion, cacheWrite, cacheRead } = price;
    const unset = {
      ...(cacheWrite == null ? { cacheWrite: 1 } : {}),
      ...(cacheRead == null ? { cacheRead: 1 } : {}),
    };
    const saved = await ModelPrice()
      .findOneAndUpdate(
        { model },
        {
          $set: {
            model,
            prompt,
            completion,
            ...(cacheWrite != null ? { cacheWrite } : {}),
            ...(cacheRead != null ? { cacheRead } : {}),
            ...(updatedBy ? { updatedBy } : {}),
          },
          ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        },
        { upsert: true, new: true, projection: priceFields },
      )
      .lean<PriceDocument>();
    await refreshModelPrices();
    return toPrice(saved ?? price);
  }

  async function deleteModelPrice(model: string): Promise<boolean> {
    const result = await ModelPrice().deleteOne({ model });
    await refreshModelPrices();
    return result.deletedCount > 0;
  }

  /** Pricing is read on every transaction, including from code that never
   *  connected — a reload there would queue a query that never settles. */
  function getModelPriceOverride(model: string): TModelRates | undefined {
    const connected = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
    if (connected && Date.now() - loadedAt > refreshAfterMs) {
      void refreshModelPrices();
    }
    return prices.get(model);
  }

  return {
    listModelPrices,
    upsertModelPrice,
    deleteModelPrice,
    refreshModelPrices,
    getModelPriceOverride,
  };
}
