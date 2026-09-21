import { memo, useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import { RectangleHorizontal, Monitor, Clapperboard, Volume2 } from 'lucide-react';
import type { AspectRatio, Resolution, Treatment, Sound } from './state';
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  TREATMENTS,
  SOUNDS,
  videoParamsAtom,
  DEFAULT_VIDEO_PARAMS,
} from './state';
import useResetOnConversationChange from './useResetOnConversationChange';
import useHasVideoTool from './useHasVideoTool';
import { useLocalize } from '~/hooks';
import ParamMenu from './ParamMenu';

/**
 * Direction for the next video generation, chosen in the composer rather than
 * described in the prompt.
 *
 * Shape and resolution are API arguments and take precedence over what the
 * model asks for. Treatment and sound are appended to the prompt instead — no
 * provider exposes a field for either — so they are direction the renderer
 * reads rather than a setting it enforces.
 *
 * Renders nothing unless the conversation's agent can generate video: format
 * pickers on a plain chat would promise something the turn cannot do.
 */
function VideoParams() {
  const localize = useLocalize();
  const [params, setParams] = useAtom(videoParamsAtom);
  const hasVideoTool = useHasVideoTool();

  const reset = useCallback(() => setParams(DEFAULT_VIDEO_PARAMS), [setParams]);
  useResetOnConversationChange(reset);

  const setAspectRatio = useCallback(
    (aspect_ratio: AspectRatio) => setParams((prev) => ({ ...prev, aspect_ratio })),
    [setParams],
  );
  const setResolution = useCallback(
    (resolution: Resolution) => setParams((prev) => ({ ...prev, resolution })),
    [setParams],
  );
  const setTreatment = useCallback(
    (treatment: Treatment) => setParams((prev) => ({ ...prev, treatment })),
    [setParams],
  );
  const setSound = useCallback(
    (sound: Sound) => setParams((prev) => ({ ...prev, sound })),
    [setParams],
  );

  const treatmentLabels = useMemo<Record<Treatment, string>>(
    () => ({
      auto: localize('com_ui_video_auto'),
      live_action: localize('com_ui_video_treatment_live_action'),
      animation: localize('com_ui_video_treatment_animation'),
      '3d': localize('com_ui_video_treatment_3d'),
      motion_graphics: localize('com_ui_video_treatment_motion_graphics'),
    }),
    [localize],
  );

  const soundLabels = useMemo<Record<Sound, string>>(
    () => ({
      auto: localize('com_ui_video_auto'),
      ambient: localize('com_ui_video_sound_ambient'),
      music: localize('com_ui_video_sound_music'),
      silent: localize('com_ui_video_sound_silent'),
    }),
    [localize],
  );

  if (!hasVideoTool) {
    return null;
  }

  return (
    <>
      <ParamMenu
        name="videoAspectRatio"
        testId="video-aspect-ratio"
        label={localize('com_ui_video_aspect_ratio')}
        icon={RectangleHorizontal}
        value={params.aspect_ratio}
        options={ASPECT_RATIOS}
        onChange={setAspectRatio}
      />
      <ParamMenu
        name="videoResolution"
        testId="video-resolution"
        label={localize('com_ui_video_resolution')}
        icon={Monitor}
        value={params.resolution}
        options={RESOLUTIONS}
        onChange={setResolution}
      />
      <ParamMenu
        name="videoTreatment"
        testId="video-treatment"
        label={localize('com_ui_video_treatment')}
        icon={Clapperboard}
        value={params.treatment}
        options={TREATMENTS}
        onChange={setTreatment}
        getLabel={(option) => treatmentLabels[option]}
      />
      <ParamMenu
        name="videoSound"
        testId="video-sound"
        label={localize('com_ui_video_sound')}
        icon={Volume2}
        value={params.sound}
        options={SOUNDS}
        onChange={setSound}
        getLabel={(option) => soundLabels[option]}
      />
    </>
  );
}

export default memo(VideoParams);
