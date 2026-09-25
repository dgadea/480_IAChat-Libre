import { Schema } from 'mongoose';
import type { Document, Types } from 'mongoose';

/**
 * An admin's price for one model, in USD per million tokens. It replaces the
 * built-in token tables for calls recorded after it is saved; spend already
 * recorded keeps the rate it was priced at.
 *
 * Deployment-wide, like the built-in tables it overrides: pricing is read
 * synchronously on every transaction, so it lives in one in-memory map rather
 * than being scoped per tenant.
 */
export interface IModelPrice extends Omit<Document, 'model'> {
  /** Exact model name as calls record it, e.g. `gemini-omni-1.1-flash` */
  model: string;
  prompt: number;
  completion: number;
  cacheWrite?: number;
  cacheRead?: number;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const modelPriceSchema: Schema<IModelPrice> = new Schema<IModelPrice>(
  {
    model: { type: String, required: true, unique: true, trim: true },
    prompt: { type: Number, required: true, min: 0 },
    completion: { type: Number, required: true, min: 0 },
    cacheWrite: { type: Number, min: 0 },
    cacheRead: { type: Number, min: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export default modelPriceSchema;
