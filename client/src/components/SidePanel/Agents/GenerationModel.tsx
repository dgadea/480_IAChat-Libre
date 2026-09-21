import { useCallback } from 'react';
import { Input } from '@librechat/client';
import { useWatch, useFormContext } from 'react-hook-form';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';

/** Tools whose generation model this agent can override, and the medium each
 *  one produces — the stored field is shared, only the wording differs. */
const GENERATION_MODEL_TOOLS = new Map<string, 'image' | 'video'>([
  ['gemini_image_gen', 'image'],
  ['image_gen_oai', 'image'],
  ['gemini_video_gen', 'video'],
]);

export const GENERATION_MODEL_TOOL_IDS: ReadonlySet<string> = new Set(
  GENERATION_MODEL_TOOLS.keys(),
);

interface Props {
  toolId: string;
}

/** Per-agent generation model, stored on the agent's `tool_options`. Left empty,
 *  the agent keeps the deployment-wide model for that tool, so an agent nobody
 *  edits behaves as it did before this control existed. */
export default function GenerationModel({ toolId }: Props) {
  const localize = useLocalize();
  const { control, getValues, setValue } = useFormContext<AgentForm>();
  const toolOptions = useWatch({ control, name: 'tool_options' });
  const value = toolOptions?.[toolId]?.image_model ?? '';
  const isVideo = GENERATION_MODEL_TOOLS.get(toolId) === 'video';

  const handleChange = useCallback(
    (nextModel: string) => {
      const updated: AgentToolOptions = { ...(getValues('tool_options') || {}) };
      const toolEntry = { ...updated[toolId] };
      if (nextModel.trim()) {
        toolEntry.image_model = nextModel;
      } else {
        delete toolEntry.image_model;
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

  const inputId = `agent-generation-model-${toolId}`;
  const label = isVideo ? localize('com_ui_video_model') : localize('com_ui_image_model');
  const placeholder = isVideo
    ? localize('com_ui_video_model_placeholder')
    : localize('com_ui_image_model_placeholder');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm text-text-primary">
        {label}
      </label>
      <Input
        id={inputId}
        type="text"
        maxLength={128}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        aria-describedby={`${inputId}-info`}
      />
      <p id={`${inputId}-info`} className="text-xs text-text-secondary">
        {localize('com_ui_image_model_info')}
      </p>
    </div>
  );
}
