import { memo, useCallback } from 'react';
import { useAtom } from 'jotai';
import { RectangleHorizontal, Monitor } from 'lucide-react';
import type { AspectRatio, Resolution } from './state';
import { ASPECT_RATIOS, RESOLUTIONS, videoParamsAtom } from './state';
import useHasVideoTool from './useHasVideoTool';
import { useLocalize } from '~/hooks';
import ParamMenu from './ParamMenu';

/**
 * Format and resolution for the next video generation, chosen in the composer
 * rather than described in the prompt. Both are sent with the request and take
 * precedence over what the model asks for, so the shot comes out in the shape
 * the user selected regardless of how the prompt is worded.
 *
 * Renders nothing unless the conversation's agent can generate video — format
 * pickers on a plain chat would promise something the turn cannot do.
 */
function VideoParams() {
  const localize = useLocalize();
  const [params, setParams] = useAtom(videoParamsAtom);
  const hasVideoTool = useHasVideoTool();

  const setAspectRatio = useCallback(
    (aspect_ratio: AspectRatio) => setParams((prev) => ({ ...prev, aspect_ratio })),
    [setParams],
  );
  const setResolution = useCallback(
    (resolution: Resolution) => setParams((prev) => ({ ...prev, resolution })),
    [setParams],
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
    </>
  );
}

export default memo(VideoParams);
