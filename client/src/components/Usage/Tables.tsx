import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TUsageAgent, TUsageModel, TUsageTotals, TUsageUser } from 'librechat-data-provider';
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

type ChildRow = { key: string; label: React.ReactNode; totals: TUsageTotals };

function ExpandableRow({
  title,
  subtitle,
  toggleLabel,
  totals,
  childRows,
  expanded,
  onToggle,
  locale,
}: {
  title: string;
  subtitle: string;
  toggleLabel: string;
  totals: TUsageTotals;
  childRows: ChildRow[];
  expanded: boolean;
  onToggle: () => void;
  locale: string;
}) {
  return (
    <Fragment>
      <tr className="hover:bg-surface-hover">
        <td className="px-2 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={toggleLabel}
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
              <span className="block truncate text-text-primary">{title}</span>
              <span className="block truncate text-xs text-text-secondary">{subtitle}</span>
            </span>
          </button>
        </td>
        <TotalsCells row={totals} locale={locale} />
      </tr>
      {expanded &&
        childRows.map((child) => (
          <tr key={child.key} className="bg-surface-secondary text-text-secondary">
            <td className="py-2 pl-8 pr-2 text-xs">{child.label}</td>
            <TotalsCells row={child.totals} locale={locale} />
          </tr>
        ))}
    </Fragment>
  );
}

function useExpanded() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  return { expanded, toggle };
}

const userName = (user: TUsageUser, localize: Localize) =>
  user.name || localize('com_usage_unknown_user');

export function UsersTable({
  users,
  locale,
  localize,
}: {
  users: TUsageUser[];
  locale: string;
  localize: Localize;
}) {
  const { expanded, toggle } = useExpanded();
  return (
    <TablePanel title={localize('com_usage_by_user')}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <TotalsHeader first={localize('com_usage_user')} localize={localize} />
        <tbody className="divide-y divide-border-light">
          {users.map((user) => (
            <ExpandableRow
              key={user.userId}
              title={userName(user, localize)}
              subtitle={user.email}
              toggleLabel={localize('com_usage_toggle_models', { name: userName(user, localize) })}
              totals={user}
              childRows={user.models.map((model) => ({
                key: model.model,
                label: modelName(model.model, localize),
                totals: model,
              }))}
              expanded={expanded.has(user.userId)}
              onToggle={() => toggle(user.userId)}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
    </TablePanel>
  );
}

export function agentName(agent: TUsageAgent, localize: Localize) {
  if (!agent.agentId) {
    return localize('com_usage_no_agent');
  }
  return agent.name || agent.agentId;
}

export function AgentsTable({
  agents,
  locale,
  localize,
}: {
  agents: TUsageAgent[];
  locale: string;
  localize: Localize;
}) {
  const { expanded, toggle } = useExpanded();
  return (
    <TablePanel title={localize('com_usage_by_agent')}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <TotalsHeader first={localize('com_usage_agent')} localize={localize} />
        <tbody className="divide-y divide-border-light">
          {agents.map((agent) => {
            const name = agentName(agent, localize);
            return (
              <ExpandableRow
                key={agent.agentId}
                title={name}
                subtitle={localize(
                  agent.users.length === 1 ? 'com_usage_agent_users_one' : 'com_usage_agent_users',
                  { count: agent.users.length },
                )}
                toggleLabel={localize('com_usage_toggle_users', { name })}
                totals={agent}
                childRows={agent.users.map((user) => ({
                  key: user.userId,
                  label: (
                    <>
                      <span className="block truncate text-text-primary">
                        {userName(user, localize)}
                      </span>
                      <span className="block truncate">{user.email}</span>
                    </>
                  ),
                  totals: user,
                }))}
                expanded={expanded.has(agent.agentId)}
                onToggle={() => toggle(agent.agentId)}
                locale={locale}
              />
            );
          })}
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
