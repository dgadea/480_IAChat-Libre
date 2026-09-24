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

export type TUsageResponse = {
  from: string;
  to: string;
  summary: TUsageTotals & { users: number };
  users: TUsageUser[];
  models: TUsageModel[];
};

export type TUsageProvider = 'openai' | 'anthropic';

/** Why a provider's billed cost could not be read */
export type TProviderBillingError = 'auth' | 'rate_limit' | 'failed';

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
