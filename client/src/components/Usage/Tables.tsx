import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TUsageModel, TUsageTotals, TUsageUser } from 'librechat-data-provider';
import { formatCost, formatCount } from './format';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Localize = ReturnType<typeof useLocalize>;

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-lg border border-border-light bg-surface-primary p-5',
        'dark:border-chart-widget-stroke dark:bg-chart-widget-surface',
        className,
      )}
    >
      {children}
    </section>
  );
}

function TotalsCells({ row, locale }: { row: TUsageTotals; locale: string }) {
  return (
    <>
      <td className="px-2 py-3 text-right tabular-nums">{formatCount(row.requests, locale)}</td>
      <td className="px-2 py-3 text-right tabular-nums">{formatCount(row.inputTokens, locale)}</td>
      <td className="px-2 py-3 text-right tabular-nums">{formatCount(row.outputTokens, locale)}</td>
      <td className="px-2 py-3 text-right tabular-nums">{formatCount(row.totalTokens, locale)}</td>
      <td className="px-2 py-3 text-right font-medium tabular-nums">
        {formatCost(row.cost, locale)}
      </td>
    </>
  );
}

function TotalsHeader({ first, localize }: { first: string; localize: Localize }) {
  return (
    <thead className="border-b border-border-medium text-xs text-text-secondary">
      <tr>
        <th scope="col" className="px-2 py-2 font-medium">
          {first}
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          {localize('com_usage_requests')}
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          {localize('com_usage_input_tokens')}
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          {localize('com_usage_output_tokens')}
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          {localize('com_usage_total_tokens')}
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          {localize('com_usage_cost')}
        </th>
      </tr>
    </thead>
  );
}

function TablePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="overflow-hidden">
      <h2 className="mb-3 text-base font-semibold text-text-primary">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </Panel>
  );
}

const modelName = (model: string, localize: Localize) =>
  model || localize('com_usage_unknown_model');

function UserRow({
  user,
  expanded,
  onToggle,
  locale,
  localize,
}: {
  user: TUsageUser;
  expanded: boolean;
  onToggle: () => void;
  locale: string;
  localize: Localize;
}) {
  const name = user.name || localize('com_usage_unknown_user');
  return (
    <Fragment>
      <tr className="hover:bg-surface-hover">
        <td className="px-2 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={localize('com_usage_toggle_models', { name })}
            className="flex w-full min-w-0 items-center gap-2 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-heavy"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0 text-text-secondary transition-transform motion-reduce:transition-none',
                expanded && 'rotate-90',
              )}
            />
            <span className="min-w-0">
              <span className="block truncate text-text-primary">{name}</span>
              <span className="block truncate text-xs text-text-secondary">{user.email}</span>
            </span>
          </button>
        </td>
        <TotalsCells row={user} locale={locale} />
      </tr>
      {expanded &&
        user.models.map((model) => (
          <tr key={model.model} className="bg-surface-secondary text-text-secondary">
            <td className="py-2 pl-8 pr-2 text-xs">{modelName(model.model, localize)}</td>
            <TotalsCells row={model} locale={locale} />
          </tr>
        ))}
    </Fragment>
  );
}

export function UsersTable({
  users,
  locale,
  localize,
}: {
  users: TUsageUser[];
  locale: string;
  localize: Localize;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (userId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) {
        next.add(userId);
      }
      return next;
    });

  return (
    <TablePanel title={localize('com_usage_by_user')}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <TotalsHeader first={localize('com_usage_user')} localize={localize} />
        <tbody className="divide-y divide-border-light">
          {users.map((user) => (
            <UserRow
              key={user.userId}
              user={user}
              expanded={expanded.has(user.userId)}
              onToggle={() => toggle(user.userId)}
              locale={locale}
              localize={localize}
            />
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}

export function ModelsTable({
  models,
  locale,
  localize,
}: {
  models: TUsageModel[];
  locale: string;
  localize: Localize;
}) {
  return (
    <TablePanel title={localize('com_usage_by_model')}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <TotalsHeader first={localize('com_usage_model')} localize={localize} />
        <tbody className="divide-y divide-border-light">
          {models.map((model) => (
            <tr key={model.model} className="hover:bg-surface-hover">
              <td className="truncate px-2 py-3 text-text-primary">
                {modelName(model.model, localize)}
              </td>
              <TotalsCells row={model} locale={locale} />
            </tr>
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}
