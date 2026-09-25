import { AlertCircle } from 'lucide-react';
import { Spinner } from '@librechat/client';
import type {
  TUsageParams,
  TUsageProvider,
  TProviderBilling,
  TProviderBillingError,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useUsageProvidersQuery } from '~/data-provider';
import { formatCost } from './format';
import { useLocalize } from '~/hooks';
import { Panel } from './Tables';

type Localize = ReturnType<typeof useLocalize>;

const providerNames: Record<TUsageProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const adminKeyVariables: Record<TUsageProvider, string> = {
  openai: 'OPENAI_ADMIN_KEY',
  anthropic: 'ANTHROPIC_ADMIN_KEY',
};

const errorKeys: Record<TProviderBillingError, TranslationKeys> = {
  auth: 'com_usage_billing_error_auth',
  needs_admin_key: 'com_usage_billing_error_needs_admin_key',
  rate_limit: 'com_usage_billing_error_rate_limit',
  failed: 'com_usage_billing_error_failed',
};

function ProviderStatus({ billing, localize }: { billing: TProviderBilling; localize: Localize }) {
  if (!billing.configured) {
    return (
      <p className="text-sm text-text-secondary">
        {localize('com_usage_billing_not_configured', {
          variable: adminKeyVariables[billing.provider],
        })}
      </p>
    );
  }
  if (billing.error) {
    return (
      <p className="flex items-center gap-2 text-sm" role="alert">
        <AlertCircle className="size-4 shrink-0 text-status-error" aria-hidden="true" />
        {localize(errorKeys[billing.error], { variable: adminKeyVariables[billing.provider] })}
      </p>
    );
  }
  if (billing.lines.length === 0) {
    return <p className="text-sm text-text-secondary">{localize('com_usage_no_data')}</p>;
  }
  return null;
}

function ProviderPanel({
  billing,
  locale,
  localize,
}: {
  billing: TProviderBilling;
  locale: string;
  localize: Localize;
}) {
  const name = providerNames[billing.provider];
  const hasCost = billing.configured && !billing.error;
  return (
    <Panel>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-text-primary">{name}</h3>
        {hasCost && (
          <span className="text-2xl font-semibold tabular-nums text-text-primary">
            {formatCost(billing.cost, locale)}
          </span>
        )}
      </div>
      <ProviderStatus billing={billing} localize={localize} />
      {hasCost && billing.lines.length > 0 && (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{localize('com_usage_billing_lines', { name })}</caption>
          <thead className="border-b border-border-medium text-xs text-text-secondary">
            <tr>
              <th scope="col" className="px-2 py-2 font-medium">
                {localize('com_usage_model')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {localize('com_usage_billed')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {billing.lines.map((line) => (
              <tr key={line.name} className="hover:bg-surface-hover">
                <td className="truncate px-2 py-2 text-text-primary">
                  {line.name || localize('com_usage_unknown_model')}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatCost(line.cost, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export default function Billing({
  params,
  locale,
  localize,
}: {
  params: TUsageParams;
  locale: string;
  localize: Localize;
}) {
  const billing = useUsageProvidersQuery(params);
  const data = billing.data;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <section className="flex flex-col gap-3" aria-busy={billing.isFetching}>
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          {localize('com_usage_billing_title')}
        </h2>
        {data && (
          <p className="mt-1 text-xs text-text-secondary">
            {localize('com_usage_billing_window', {
              from: dateFormat.format(new Date(data.from)),
              to: dateFormat.format(new Date(Date.parse(data.to) - 1)),
            })}
          </p>
        )}
      </div>
      {billing.isLoading && (
        <Panel className="flex items-center gap-3">
          <Spinner className="size-5 text-text-secondary" />
          <span className="text-sm text-text-secondary">
            {localize('com_usage_billing_loading')}
          </span>
        </Panel>
      )}
      {billing.isError && (
        <Panel className="flex items-center gap-2">
          <AlertCircle className="size-4 text-status-error" aria-hidden="true" />
          <span className="text-sm" role="alert">
            {localize('com_usage_billing_error_failed')}
          </span>
        </Panel>
      )}
      {data && (
        <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2">
          {data.providers.map((provider) => (
            <ProviderPanel
              key={provider.provider}
              billing={provider}
              locale={locale}
              localize={localize}
            />
          ))}
        </div>
      )}
    </section>
  );
}
