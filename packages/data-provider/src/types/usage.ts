/** Widest window one usage request may aggregate, bounding the scan over transactions */
export const USAGE_MAX_RANGE_DAYS = 366;
/** Transactions record spend in credits; one million credits is one US dollar */
export const USAGE_CREDITS_PER_USD = 1_000_000;

export type TUsageParams = {
  fromTimestamp: string;
  toTimestamp: string;
};

export type TUsageTotals = {
  /** Model calls, counted by their prompt transactions */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Spend in US dollars, from the credit value LibreChat priced each transaction at */
  cost: number;
};

export type TUsageModel = TUsageTotals & {
  model: string;
};

export type TUsageUser = TUsageTotals & {
  userId: string;
  name: string;
  email: string;
  models: TUsageModel[];
};

export type TUsageAgent = TUsageTotals & {
  /** Empty for spend no saved agent answered: direct model chats, or unsaved responses */
  agentId: string;
  name: string;
  users: TUsageUser[];
};

export type TUsageResponse = {
  from: string;
  to: string;
  summary: TUsageTotals & { users: number };
  users: TUsageUser[];
  models: TUsageModel[];
  agents: TUsageAgent[];
};

export type TUsageProvider = 'openai' | 'anthropic';

/** Why a provider's billed cost could not be read */
export type TProviderBillingError = 'auth' | 'needs_admin_key' | 'rate_limit' | 'failed';

export type TProviderLineCost = {
  /** The model, or the provider's own line item name for costs not tied to one */
  name: string;
  cost: number;
};

export type TProviderBilling = {
  provider: TUsageProvider;
  /** False until the provider's admin key is set on the server */
  configured: boolean;
  cost: number;
  lines: TProviderLineCost[];
  error?: TProviderBillingError;
};

export type TProviderBillingResponse = {
  /** Providers bill whole UTC days, so the window is widened to day boundaries */
  from: string;
  to: string;
  providers: TProviderBilling[];
};

/** Highest rate an admin can set, in USD per million tokens; guards against a typo in cents */
export const MODEL_PRICE_MAX_RATE = 100_000;
export const MODEL_PRICE_MODEL_MAX_LENGTH = 256;

/** USD per million tokens */
export type TModelRates = {
  prompt: number;
  completion: number;
  cacheWrite?: number;
  cacheRead?: number;
};

export type TModelPrice = TModelRates & {
  /** Exact model name as calls record it */
  model: string;
};

/** Where a model's rate comes from: an admin's edit, the built-in tables, or the fallback rate */
export type TModelPriceSource = 'override' | 'table' | 'default';

export type TModelPriceRow = {
  model: string;
  source: TModelPriceSource;
  /** The rates new calls are priced at */
  rates: TModelRates;
  /** What the built-in tables would charge without the admin's edit */
  base: TModelRates;
  /** The built-in table entry the model matched, when it matched one */
  baseKey?: string;
};

export type TModelPricesResponse = {
  prices: TModelPriceRow[];
};
