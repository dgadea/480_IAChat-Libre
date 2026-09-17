import { useCallback } from 'react';
import { Input } from '@librechat/client';
import { useWatch, useFormContext } from 'react-hook-form';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';

const IMAGE_GEN_TOOL_ID = 'gemini_image_gen';

/** Per-agent image model for `gemini_image_gen`, stored on the agent's
 *  `tool_options`. Left empty, the agent keeps the deployment-wide
 *  `GEMINI_IMAGE_MODEL`, so an agent nobody edits behaves as it did before
 *  this control existed. */
export default function ImageModel() {
  const localize = useLocalize();
  const { control, getValues, setValue } = useFormContext<AgentForm>();
  const toolOptions = useWatch({ control, name: 'tool_options' });
  const value = toolOptions?.[IMAGE_GEN_TOOL_ID]?.image_model ?? '';

  const handleChange = useCallback(
    (nextModel: string) => {
      const updated: AgentToolOptions = { ...(getValues('tool_options') || {}) };
      const toolEntry = { ...updated[IMAGE_GEN_TOOL_ID] };
      if (nextModel.trim()) {
        toolEntry.image_model = nextModel;
      } else {
        delete toolEntry.image_model;
      }
      if (Object.keys(toolEntry).length === 0) {
        delete updated[IMAGE_GEN_TOOL_ID];
      } else {
        updated[IMAGE_GEN_TOOL_ID] = toolEntry;
      }
      setValue('tool_options', updated, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="agent-image-model" className="text-sm text-text-primary">
        {localize('com_ui_image_model')}
      </label>
      <Input
        id="agent-image-model"
        type="text"
        maxLength={128}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={localize('com_ui_image_model_placeholder')}
        aria-label={localize('com_ui_image_model')}
        aria-describedby="agent-image-model-info"
      />
      <p id="agent-image-model-info" className="text-xs text-text-secondary">
        {localize('com_ui_image_model_info')}
      </p>
    </div>
  );
}
