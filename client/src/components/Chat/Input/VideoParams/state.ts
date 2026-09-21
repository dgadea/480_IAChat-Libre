import type { TToolSettings } from 'librechat-data-provider';
import { createStorageAtom } from '~/store/jotai-utils';

export const VIDEO_TOOL_ID = 'gemini_video_gen';

export const ASPECT_RATIOS = ['16:9', '9:16'] as const;
export const RESOLUTIONS = ['360p', '720p', '1080p', '4k'] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];

export interface VideoParamsState {
  aspect_ratio: AspectRatio;
  resolution: Resolution;
}

/** What the provider produces when the request names neither, mirrored here so
 *  the controls open on the value a generation would actually use. */
export const DEFAULT_VIDEO_PARAMS: VideoParamsState = {
  aspect_ratio: '16:9',
  resolution: '720p',
};

/** A per-viewer convenience: someone shooting Reels keeps 9:16 across sessions
 *  rather than re-picking it every time. Nothing downstream depends on it
 *  surviving, so losing it to cleared site data costs a click. */
export const videoParamsAtom = createStorageAtom<VideoParamsState>(
  'videoParams',
  DEFAULT_VIDEO_PARAMS,
);

/**
 * The submission shape. Keyed by tool id so the request carries settings the
 * same way an agent's `tool_options` does, and a second media tool needs a new
 * key rather than a new field.
 */
export function toToolSettings(params: VideoParamsState): TToolSettings {
  return { [VIDEO_TOOL_ID]: { ...params } };
}
