import { atom } from 'jotai';
import type { TToolSettings } from 'librechat-data-provider';

export const VIDEO_TOOL_ID = 'gemini_video_gen';

export const ASPECT_RATIOS = ['16:9', '9:16'] as const;
export const RESOLUTIONS = ['360p', '720p', '1080p', '4k'] as const;

/** `auto` is the absence of a preference, not a value: it is dropped before the
 *  request so an untouched control adds nothing to the prompt. */
export const TREATMENTS = ['auto', 'live_action', 'animation', '3d', 'motion_graphics'] as const;
export const SOUNDS = ['auto', 'ambient', 'music', 'silent'] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type Resolution = (typeof RESOLUTIONS)[number];
export type Treatment = (typeof TREATMENTS)[number];
export type Sound = (typeof SOUNDS)[number];

export interface VideoParamsState {
  aspect_ratio: AspectRatio;
  resolution: Resolution;
  treatment: Treatment;
  sound: Sound;
}

export const DEFAULT_VIDEO_PARAMS: VideoParamsState = {
  aspect_ratio: '16:9',
  resolution: '720p',
  treatment: 'auto',
  /** The provider generates audio natively and these clips are usually cut to a
   *  track later, so silence is the useful starting point. Prompt direction
   *  rather than an API setting, so it asks for silence without guaranteeing it. */
  sound: 'silent',
};

/**
 * Deliberately not persisted. A remembered 4k or 9:16 is a setting nobody chose
 * for the clip in front of them, and each generation costs real money, so every
 * session starts from the same known state rather than from whatever the last
 * one was experimenting with.
 */
export const videoParamsAtom = atom<VideoParamsState>(DEFAULT_VIDEO_PARAMS);

/**
 * The submission shape. Keyed by tool id so the request carries settings the
 * same way an agent's `tool_options` does, and a second media tool needs a new
 * key rather than a new field.
 */
export function toToolSettings({
  aspect_ratio,
  resolution,
  treatment,
  sound,
}: VideoParamsState): TToolSettings {
  return {
    [VIDEO_TOOL_ID]: {
      aspect_ratio,
      resolution,
      ...(treatment !== 'auto' ? { treatment } : {}),
      ...(sound !== 'auto' ? { sound } : {}),
    },
  };
}
