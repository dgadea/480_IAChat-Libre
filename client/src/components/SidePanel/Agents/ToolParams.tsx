import { useCallback, useId, useState } from 'react';
import { useWatch, useFormContext } from 'react-hook-form';
import { Dropdown, Input, Switch } from '@librechat/client';
import { isValidToolParamValue } from 'librechat-data-provider';
import type {
  ToolParamOverride,
  AgentToolOptions,
  ToolParamValue,
  ToolParamMode,
  MCPToolParam,
} from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';

type ParamMode = ToolParamMode | 'auto';

interface ToolParamsProps {
  toolId: string;
  params: MCPToolParam[];
}

interface ParamRowProps {
  param: MCPToolParam;
  override?: ToolParamOverride;
  onChange: (name: string, override?: ToolParamOverride) => void;
}

function initialValue(param: MCPToolParam, override?: ToolParamOverride): ToolParamValue | '' {
  if (override) {
    return override.value;
  }
  if (param.default != null) {
    return param.default;
  }
  if (param.enum?.length) {
    return param.enum[0];
  }
  if (param.type === 'boolean') {
    return false;
  }
  return param.minimum ?? '';
}

function parseDraft(param: MCPToolParam, draft: string): ToolParamValue | undefined {
  if (param.type === 'string') {
    return draft.trim() ? draft : undefined;
  }
  if (draft.trim() === '') {
    return undefined;
  }
  const value = Number(draft);
  return Number.isNaN(value) ? undefined : value;
}

function ParamRow({ param, override, onChange }: ParamRowProps) {
  const localize = useLocalize();
  const id = useId();
  const [mode, setMode] = useState<ParamMode>(override?.mode ?? 'auto');
  const [value, setValue] = useState<ToolParamValue | ''>(() => initialValue(param, override));
  const [draft, setDraft] = useState(() => String(initialValue(param, override)));
  const [invalid, setInvalid] = useState(false);

  const commit = useCallback(
    (nextMode: ParamMode, nextValue: ToolParamValue | '' | undefined) => {
      if (nextMode === 'auto') {
        setInvalid(false);
        onChange(param.name);
        return;
      }
      const valid =
        nextValue !== undefined && nextValue !== '' && isValidToolParamValue(param, nextValue);
      setInvalid(!valid);
      onChange(param.name, valid ? { mode: nextMode, value: nextValue } : undefined);
    },
    [param, onChange],
  );

  const handleMode = (next: string) => {
    const nextMode = next as ParamMode;
    setMode(nextMode);
    commit(nextMode, param.enum || param.type === 'boolean' ? value : parseDraft(param, draft));
  };

  const handleValue = (next: ToolParamValue) => {
    setValue(next);
    commit(mode, next);
  };

  const handleDraft = (next: string) => {
    setDraft(next);
    commit(mode, parseDraft(param, next));
  };

  const modeOptions = [
    { value: 'auto', label: localize('com_ui_mcp_param_mode_auto') },
    { value: 'default', label: localize('com_ui_mcp_param_mode_default') },
    { value: 'fixed', label: localize('com_ui_mcp_param_mode_fixed') },
  ];
  const valueLabel = localize('com_ui_mcp_param_value_label', { 0: param.name });
  const hasRange = param.minimum != null || param.maximum != null;
  const hintId = `${id}-hint`;

  const renderValue = () => {
    if (param.enum?.length) {
      const options = param.enum.map((option) => ({
        value: String(option),
        label: String(option),
      }));
      return (
        <Dropdown
          value={String(value)}
          options={options}
          onChange={(next) =>
            handleValue(param.enum?.find((option) => String(option) === next) ?? next)
          }
          ariaLabel={valueLabel}
          variant="field"
          portal={false}
          className="w-full"
        />
      );
    }
    if (param.type === 'boolean') {
      return (
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => handleValue(checked)}
          aria-label={valueLabel}
        />
      );
    }
    const numeric = param.type !== 'string';
    return (
      <Input
        type={numeric ? 'number' : 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        min={param.minimum}
        max={param.maximum}
        step={param.type === 'integer' ? 1 : 'any'}
        maxLength={numeric ? undefined : 4000}
        value={draft}
        onChange={(event) => handleDraft(event.target.value)}
        aria-label={valueLabel}
        aria-invalid={invalid}
        aria-describedby={hasRange || invalid ? hintId : undefined}
      />
    );
  };

  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-name`} className="min-w-0 truncate font-mono text-xs text-text-primary">
          {param.name}
        </span>
        <Dropdown
          value={mode}
          options={modeOptions}
          onChange={handleMode}
          ariaLabel={localize('com_ui_mcp_param_mode_label', { 0: param.name })}
          variant="field"
          portal={false}
          className="w-36 shrink-0"
        />
      </div>
      {param.description && (
        <p className="line-clamp-2 text-xs text-text-secondary">{param.description}</p>
      )}
      {mode !== 'auto' && (
        <div className="flex flex-col gap-1">
          {renderValue()}
          {(hasRange || invalid) && (
            <p
              id={hintId}
              className={invalid ? 'text-xs text-text-destructive' : 'text-xs text-text-secondary'}
            >
              {invalid
                ? localize('com_ui_mcp_param_invalid')
                : localize('com_ui_mcp_param_range', {
                    0: param.minimum ?? '−∞',
                    1: param.maximum ?? '∞',
                  })}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Per-agent presets for an MCP tool's arguments, built from the tool's own input schema so any
 * tool — and any model a provider exposes as a tool — gets its own fields. Stored on
 * `tool_options[toolId].params`; an argument left on "model decides" stores nothing.
 */
export default function ToolParams({ toolId, params }: ToolParamsProps) {
  const localize = useLocalize();
  const { control, getValues, setValue } = useFormContext<AgentForm>();
  const toolOptions = useWatch({ control, name: 'tool_options' });
  const stored = toolOptions?.[toolId]?.params;

  const handleChange = useCallback(
    (name: string, override?: ToolParamOverride) => {
      const updated: AgentToolOptions = { ...(getValues('tool_options') || {}) };
      const toolEntry = { ...updated[toolId] };
      const nextParams = { ...toolEntry.params };
      if (override) {
        nextParams[name] = override;
      } else {
        delete nextParams[name];
      }
      if (Object.keys(nextParams).length > 0) {
        toolEntry.params = nextParams;
      } else {
        delete toolEntry.params;
      }
      if (Object.keys(toolEntry).length === 0) {
        delete updated[toolId];
      } else {
        updated[toolId] = toolEntry;
      }
      setValue('tool_options', updated, { shouldDirty: true });
    },
    [toolId, getValues, setValue],
  );

  if (params.length === 0) {
    return null;
  }

  return (
    <section aria-label={localize('com_ui_mcp_params')} className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-text-primary">{localize('com_ui_mcp_params')}</h4>
      <p className="text-xs text-text-secondary">{localize('com_ui_mcp_params_info')}</p>
      <ul className="divide-y divide-border-light">
        {params.map((param) => (
          <ParamRow
            key={param.name}
            param={param}
            override={stored?.[param.name]}
            onChange={handleChange}
          />
        ))}
      </ul>
    </section>
  );
}
