import type { Model } from 'mongoose';
import type { IModelPrice } from '~/schema/modelPrice';
import modelPriceSchema from '~/schema/modelPrice';

export function createModelPriceModel(mongoose: typeof import('mongoose')): Model<IModelPrice> {
  return mongoose.models.ModelPrice || mongoose.model<IModelPrice>('ModelPrice', modelPriceSchema);
}
