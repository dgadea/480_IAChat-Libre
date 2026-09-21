import { memo } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { TooltipAnchor, composerControlClasses } from '@librechat/client';
import type { LucideIcon } from 'lucide-react';
import { cn } from '~/utils';

interface ParamMenuProps<T extends string> {
  /** Groups the radio items, so the two menus never share a selection. */
  name: string;
  label: string;
  icon: LucideIcon;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  /** Reads a value for display; values like `motion_graphics` are identifiers,
   *  not labels. Defaults to the value itself for the already-readable ones. */
  getLabel?: (value: T) => string;
  testId?: string;
}

/**
 * One composer dropdown holding a small set of mutually exclusive values.
 * Generic over the value so each menu keeps its own literal union rather than
 * widening to `string` at the call site.
 */
function ParamMenuComponent<T extends string>({
  name,
  label,
  icon: Icon,
  value,
  options,
  onChange,
  getLabel = (option: T) => option,
  testId,
}: ParamMenuProps<T>) {
  const menuStore = Ariakit.useMenuStore({ focusLoop: true });
  const isOpen = menuStore.useState('open');

  return (
    <Ariakit.MenuProvider store={menuStore}>
      <TooltipAnchor
        description={label}
        disabled={isOpen}
        render={
          <Ariakit.MenuButton
            data-testid={testId}
            aria-label={`${label}: ${getLabel(value)}`}
            className={cn(
              composerControlClasses(),
              'min-w-0 max-w-full px-2.5 md:px-theme-normal',
              isOpen && 'bg-surface-hover',
            )}
          />
        }
      >
        <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 truncate">{getLabel(value)}</span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-text-secondary transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </TooltipAnchor>
      <Ariakit.Menu
        portal={true}
        gutter={8}
        unmountOnHide={true}
        className={cn(
          'z-50 flex min-w-[180px] flex-col rounded-xl',
          'max-h-[var(--popover-available-height)] overflow-y-auto border border-border-light bg-presentation p-1.5 shadow-lg',
          'origin-bottom opacity-0 transition-[opacity,transform] duration-200 ease-out',
          'data-[enter]:scale-100 data-[enter]:opacity-100',
          'scale-95 data-[leave]:scale-95 data-[leave]:opacity-0',
        )}
      >
        {/* Names the menu without adding a heading to the page outline. */}
        <Ariakit.MenuHeading
          render={<div />}
          className="px-2.5 py-1.5 text-xs font-medium text-text-secondary"
        >
          {label}
        </Ariakit.MenuHeading>
        {options.map((option) => (
          <Ariakit.MenuItemRadio
            key={option}
            name={name}
            value={option}
            checked={option === value}
            hideOnClick={true}
            onChange={() => onChange(option)}
            className={cn(
              'flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2',
              'text-sm text-text-primary outline-none transition-colors duration-theme-fast',
              'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
              option === value && 'bg-surface-active-alt',
            )}
          >
            {getLabel(option)}
          </Ariakit.MenuItemRadio>
        ))}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
}

export default memo(ParamMenuComponent) as typeof ParamMenuComponent;
