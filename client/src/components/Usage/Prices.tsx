import { useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { Button, Input, Spinner } from '@librechat/client';
import type { TModelPrice, TModelPriceRow, TModelRates } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useModelPricesQuery,
  useSaveModelPriceMutation,
  useResetModelPriceMutation,
} from '~/data-provider';
import { formatRate } from './format';
import { useLocalize } from '~/hooks';
import { Panel } from './Tables';
import { cn } from '~/utils';

type Localize = ReturnType<typeof useLocalize>;
type RateField = keyof TModelRates;
type Draft = { model: string; isNew: boolean; values: Record<RateField, string> };

const rateFields: Array<{ field: RateField; labelKey: TranslationKeys; required: boolean }> = [
  { field: 'prompt', labelKey: 'com_usage_input_tokens', required: true },
  { field: 'completion', labelKey: 'com_usage_output_tokens', required: true },
  { field: 'cacheWrite', labelKey: 'com_usage_prices_cache_write', required: false },
  { field: 'cacheRead', labelKey: 'com_usage_prices_cache_read', required: false },
];

const sourceLabels: Record<TModelPriceRow['source'], TranslationKeys> = {
  override: 'com_usage_prices_source_override',
  table: 'com_usage_prices_source_table',
  default: 'com_usage_prices_source_default',
};

const toText = (value?: number) => (value == null ? '' : String(value));

function draftFor(row: TModelPriceRow): Draft {
  return {
    model: row.model,
    isNew: false,
    values: {
      prompt: toText(row.rates.prompt),
      completion: toText(row.rates.completion),
      cacheWrite: row.source === 'override' ? toText(row.rates.cacheWrite) : '',
      cacheRead: row.source === 'override' ? toText(row.rates.cacheRead) : '',
    },
  };
}

const emptyDraft = (): Draft => ({
  model: '',
  isNew: true,
  values: { prompt: '', completion: '', cacheWrite: '', cacheRead: '' },
});

/** A number the server will accept, or undefined for a blank optional rate; null when invalid */
function parseRate(text: string, required: boolean): number | undefined | null {
  if (text.trim() === '') {
    return required ? null : undefined;
  }
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function toPrice(draft: Draft): TModelPrice | null {
  const model = draft.model.trim();
  const rates = rateFields.map(({ field, required }) => [
    field,
    parseRate(draft.values[field], required),
  ]);
  if (!model || rates.some(([, value]) => value === null)) {
    return null;
  }
  return {
    model,
    ...Object.fromEntries(rates.filter(([, value]) => value !== undefined)),
  } as TModelPrice;
}

function responseStatus(error: unknown) {
  return (error as { response?: { status?: number } } | undefined)?.response?.status;
}

function EditRow({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  localize,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  localize: Localize;
}) {
  const name = draft.model || localize('com_usage_model');
  return (
    <tr className="bg-surface-secondary">
      <td className="px-2 py-2">
        {draft.isNew ? (
          <Input
            value={draft.model}
            placeholder={localize('com_usage_prices_model_placeholder')}
            aria-label={localize('com_usage_model')}
            onChange={(event) => onChange({ ...draft, model: event.target.value })}
            className="h-8"
          />
        ) : (
          <span className="text-text-primary">{draft.model}</span>
        )}
      </td>
      {rateFields.map(({ field, labelKey, required }) => (
        <td key={field} className="px-2 py-2">
          <Input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={draft.values[field]}
            required={required}
            placeholder={required ? '' : localize('com_usage_prices_table_rate')}
            aria-label={`${localize(labelKey)} · ${name}`}
            onChange={(event) =>
              onChange({ ...draft, values: { ...draft.values, [field]: event.target.value } })
            }
            onKeyDown={(event) => event.key === 'Enter' && onSave()}
            className="h-8 w-24 text-right tabular-nums"
          />
        </td>
      ))}
      <td className="px-2 py-2" />
      <td className="px-2 py-2">
        <div className="flex justify-end gap-1">
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Spinner className="size-4" /> : localize('com_ui_save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            {localize('com_ui_cancel')}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function PriceRow({
  row,
  locale,
  onEdit,
  onReset,
  resetting,
  localize,
}: {
  row: TModelPriceRow;
  locale: string;
  onEdit: () => void;
  onReset: () => void;
  resetting: boolean;
  localize: Localize;
}) {
  return (
    <tr className="hover:bg-surface-hover">
      <td className="truncate px-2 py-3 text-text-primary">{row.model}</td>
      {rateFields.map(({ field }) => (
        <td key={field} className="px-2 py-3 text-right tabular-nums">
          {row.rates[field] == null ? '—' : formatRate(row.rates[field] ?? 0, locale)}
        </td>
      ))}
      <td
        className={cn(
          'px-2 py-3 text-xs',
          row.source === 'override' && 'text-status-info',
          row.source === 'default' && 'text-status-warning',
          row.source === 'table' && 'text-text-secondary',
        )}
      >
        {localize(sourceLabels[row.source])}
      </td>
      <td className="px-2 py-3">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            aria-label={localize('com_usage_prices_edit', { model: row.model })}
          >
            {localize('com_ui_edit')}
          </Button>
          {row.source === 'override' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onReset}
              disabled={resetting}
              aria-label={localize('com_usage_prices_reset', { model: row.model })}
            >
              {localize('com_ui_reset')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function Prices({
  models,
  locale,
  localize,
}: {
  models: string[];
  locale: string;
  localize: Localize;
}) {
  const pricesQuery = useModelPricesQuery(models);
  const save = useSaveModelPriceMutation();
  const reset = useResetModelPriceMutation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [invalid, setInvalid] = useState(false);
  const rows = pricesQuery.data?.prices ?? [];

  const edit = (next: Draft | null) => {
    setDraft(next);
    setInvalid(false);
    save.reset();
  };

  const handleSave = () => {
    const price = draft ? toPrice(draft) : null;
    if (!price) {
      setInvalid(true);
      return;
    }
    save.mutate(price, { onSuccess: () => edit(null) });
  };

  const errorKey = ((): TranslationKeys | null => {
    if (invalid) {
      return 'com_usage_prices_invalid';
    }
    if (responseStatus(save.error ?? reset.error) === 403) {
      return 'com_usage_prices_forbidden';
    }
    return save.isError || reset.isError ? 'com_usage_prices_save_error' : null;
  })();

  return (
    <Panel className="overflow-hidden">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">
          {localize('com_usage_prices_title')}
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => edit(emptyDraft())}
          disabled={draft?.isNew === true}
        >
          <Plus className="size-4" aria-hidden="true" />
          {localize('com_usage_prices_add')}
        </Button>
      </div>
      <p className="mb-3 text-xs text-text-secondary">{localize('com_usage_prices_note')}</p>
      {errorKey && (
        <p className="mb-3 flex items-center gap-2 text-sm" role="alert">
          <AlertCircle className="size-4 shrink-0 text-status-error" aria-hidden="true" />
          {localize(errorKey)}
        </p>
      )}
      {pricesQuery.isLoading && (
        <div className="flex min-h-24 items-center justify-center">
          <Spinner className="size-5 text-text-secondary" />
        </div>
      )}
      {pricesQuery.isError && (
        <p className="text-sm" role="alert">
          {localize('com_usage_prices_load_error')}
        </p>
      )}
      {!pricesQuery.isLoading && !pricesQuery.isError && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border-medium text-xs text-text-secondary">
              <tr>
                <th scope="col" className="px-2 py-2 font-medium">
                  {localize('com_usage_model')}
                </th>
                {rateFields.map(({ field, labelKey }) => (
                  <th key={field} scope="col" className="px-2 py-2 text-right font-medium">
                    {localize(labelKey)}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 font-medium">
                  {localize('com_usage_prices_source')}
                </th>
                <th scope="col" className="px-2 py-2">
                  <span className="sr-only">{localize('com_usage_prices_actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {draft?.isNew && (
                <EditRow
                  draft={draft}
                  onChange={setDraft}
                  onSave={handleSave}
                  onCancel={() => edit(null)}
                  saving={save.isLoading}
                  localize={localize}
                />
              )}
              {rows.map((row) =>
                draft && !draft.isNew && draft.model === row.model ? (
                  <EditRow
                    key={row.model}
                    draft={draft}
                    onChange={setDraft}
                    onSave={handleSave}
                    onCancel={() => edit(null)}
                    saving={save.isLoading}
                    localize={localize}
                  />
                ) : (
                  <PriceRow
                    key={row.model}
                    row={row}
                    locale={locale}
                    onEdit={() => edit(draftFor(row))}
                    onReset={() => reset.mutate(row.model)}
                    resetting={reset.isLoading && reset.variables === row.model}
                    localize={localize}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
