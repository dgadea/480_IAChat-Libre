import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Download, Info } from 'lucide-react';
import { USAGE_MAX_RANGE_DAYS } from 'librechat-data-provider';
import { Button, Spinner, useMediaQuery } from '@librechat/client';
import type { TUsageParams } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { dateStamp, formatCompact, formatCost, formatCount } from './format';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { LocalizedDateRangePicker } from '~/components/ui';
import { ModelsTable, Panel, UsersTable } from './Tables';
import { useDocumentTitle, useLocalize } from '~/hooks';
import { useUsageQuery } from '~/data-provider';
import { downloadCsv, usageCsv } from './csv';
import { cn } from '~/utils';

type Preset = 'month' | '7d' | '30d' | '90d';
type UsageRange = { preset?: Preset; startDate: Date; endDate: Date };

const dayMs = 24 * 60 * 60 * 1000;
const presets: Array<{ value: Preset; labelKey: TranslationKeys; days?: number }> = [
  { value: 'month', labelKey: 'com_usage_range_month' },
  { value: '7d', labelKey: 'com_usage_range_7_days', days: 7 },
  { value: '30d', labelKey: 'com_usage_range_30_days', days: 30 },
  { value: '90d', labelKey: 'com_usage_range_90_days', days: 90 },
];

function presetRange(preset: Preset, now = new Date()): UsageRange {
  const days = presets.find((item) => item.value === preset)?.days;
  const startDate = days
    ? new Date(now.getTime() - days * dayMs)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  return { preset, startDate, endDate: now };
}

function responseStatus(error: unknown) {
  return (error as { response?: { status?: number } } | undefined)?.response?.status;
}

function Kpi({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <Panel>
      <h2 className="text-sm font-normal text-text-secondary">{title}</h2>
      <div className="mt-3 text-3xl font-semibold tabular-nums leading-none text-text-primary">
        {value}
      </div>
      {detail && <p className="mt-2 text-xs text-text-secondary">{detail}</p>}
    </Panel>
  );
}

export default function UsageView() {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [range, setRange] = useState<UsageRange>(() => presetRange('month'));
  const params = useMemo<TUsageParams>(
    () => ({
      fromTimestamp: range.startDate.toISOString(),
      toTimestamp: range.endDate.toISOString(),
    }),
    [range],
  );
  const usage = useUsageQuery(params);
  const data = usage.data;
  const status = responseStatus(usage.error);

  useDocumentTitle(`${localize('com_usage_title')} | LibreChat`);

  const handleExport = () => {
    if (!data) {
      return;
    }
    const fileName = `usage_${dateStamp(range.startDate)}_${dateStamp(range.endDate)}.csv`;
    downloadCsv(usageCsv(data.users), fileName);
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-presentation text-text-primary">
      <header className="z-20 flex min-h-14 w-full flex-shrink-0 flex-col gap-3 border-b border-border-light bg-presentation px-4 py-3 sm:px-5 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {isSmallScreen && <OpenSidebar />}
          <h1 className="text-base font-semibold">{localize('com_usage_title')}</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2 md:flex-nowrap">
          <div
            role="group"
            aria-label={localize('com_usage_range')}
            className="inline-flex rounded-lg border border-border-light p-0.5"
          >
            {presets.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant="ghost"
                aria-pressed={range.preset === item.value}
                className={cn(
                  'h-8 rounded-md px-3',
                  range.preset === item.value && 'bg-surface-active-alt',
                )}
                onClick={() => setRange(presetRange(item.value))}
              >
                {localize(item.labelKey)}
              </Button>
            ))}
          </div>
          <div className="w-full min-w-0 sm:w-[300px]">
            <LocalizedDateRangePicker
              startDate={range.startDate}
              endDate={range.endDate}
              futureDatesDisabled
              labels={{
                apply: localize('com_ui_done'),
                cancel: localize('com_ui_cancel'),
                startDate: localize('com_usage_start_date'),
                endDate: localize('com_usage_end_date'),
                invalidRange: localize('com_usage_invalid_date_range', {
                  days: USAGE_MAX_RANGE_DAYS,
                }),
              }}
              locale={locale}
              maxRangeLength={USAGE_MAX_RANGE_DAYS}
              onSelectDateRange={(startDate, endDate) => setRange({ startDate, endDate })}
              placeholder={localize('com_usage_date_range_placeholder')}
            />
          </div>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!data || data.users.length === 0}
            onClick={handleExport}
          >
            <Download className="size-4" aria-hidden="true" />
            {localize('com_usage_export_csv')}
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="flex w-full min-w-0 flex-col gap-3 px-4 pb-4 pt-6 sm:px-8"
          aria-busy={usage.isFetching}
        >
          <p className="flex items-start gap-2 text-xs text-text-secondary">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {localize('com_usage_disclaimer')}
          </p>
          {usage.isLoading && (
            <Panel className="flex min-h-52 flex-col items-center justify-center gap-3">
              <Spinner className="size-7 text-text-secondary" />
              <span className="text-sm text-text-secondary">{localize('com_usage_loading')}</span>
            </Panel>
          )}
          {usage.isError && (
            <Panel className="flex items-center gap-2">
              <AlertCircle className="size-4 text-status-error" aria-hidden="true" />
              <span className="text-sm" role="alert">
                {status === 403
                  ? localize('com_usage_forbidden')
                  : localize('com_usage_load_error')}
              </span>
            </Panel>
          )}
          {data && (
            <>
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  title={localize('com_usage_cost')}
                  value={formatCost(data.summary.cost, locale)}
                />
                <Kpi
                  title={localize('com_usage_total_tokens')}
                  value={formatCompact(data.summary.totalTokens, locale)}
                  detail={localize('com_usage_tokens_split', {
                    input: formatCompact(data.summary.inputTokens, locale),
                    output: formatCompact(data.summary.outputTokens, locale),
                  })}
                />
                <Kpi
                  title={localize('com_usage_active_users')}
                  value={formatCount(data.summary.users, locale)}
                />
                <Kpi
                  title={localize('com_usage_requests')}
                  value={formatCount(data.summary.requests, locale)}
                />
              </div>
              {data.users.length === 0 ? (
                <Panel className="flex min-h-40 items-center justify-center text-sm text-text-secondary">
                  {localize('com_usage_no_data')}
                </Panel>
              ) : (
                <>
                  <UsersTable users={data.users} locale={locale} localize={localize} />
                  <ModelsTable models={data.models} locale={locale} localize={localize} />
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
