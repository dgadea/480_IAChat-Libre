import type { AgentToolOptions, TToolSettings } from 'librechat-data-provider';
import type { VideoAdapterCapabilities } from '../../video/types';
import type { ExtendedJsonSchema } from '../registry/schema';
import { GEMINI_CAPABILITIES } from '../../video/gemini';
import { resolveAgentImageModel } from './images';

/** Model used when neither the agent nor the deployment selects one. */
export const DEFAULT_GEMINI_VIDEO_MODEL = 'gemini-omni-1.1-flash';

/** Per-agent video model for `gemini_video_gen`, falling back to
 *  `GEMINI_VIDEO_MODEL` and then the built-in default. */
export function resolveGeminiVideoModel(toolOptions?: AgentToolOptions | null): string {
  return resolveAgentImageModel({
    toolOptions,
    toolId: 'gemini_video_gen',
    deploymentModel: process.env.GEMINI_VIDEO_MODEL,
    fallbackModel: DEFAULT_GEMINI_VIDEO_MODEL,
  });
}

export const GEMINI_VIDEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export const GEMINI_VIDEO_RESOLUTIONS = ['360p', '720p', '1080p', '4k'] as const;

export type GeminiVideoAspectRatio = (typeof GEMINI_VIDEO_ASPECT_RATIOS)[number];
export type GeminiVideoResolution = (typeof GEMINI_VIDEO_RESOLUTIONS)[number];

export interface GeminiVideoParams {
  aspect_ratio?: GeminiVideoAspectRatio;
  resolution?: GeminiVideoResolution;
}

const isAspectRatio = (value?: string): value is GeminiVideoAspectRatio =>
  GEMINI_VIDEO_ASPECT_RATIOS.includes(value as GeminiVideoAspectRatio);

const isResolution = (value?: string): value is GeminiVideoResolution =>
  GEMINI_VIDEO_RESOLUTIONS.includes(value as GeminiVideoResolution);

/**
 * Video settings that override what the model asks for on this one call.
 *
 * The request wins over the agent because it is the more deliberate choice: a
 * user who changed the control in the composer did so for this shot. Values
 * outside the API's enums are dropped rather than forwarded, so a stale client
 * cannot push the provider into rejecting the whole generation.
 */
export function resolveGeminiVideoParams({
  toolOptions,
  requestParams,
  toolId = 'gemini_video_gen',
}: {
  toolOptions?: AgentToolOptions | null;
  requestParams?: TToolSettings | null;
  toolId?: string;
}): GeminiVideoParams {
  const fromAgent = toolOptions?.[toolId];
  const fromRequest = requestParams?.[toolId];

  const aspectRatio = fromRequest?.aspect_ratio?.trim() || fromAgent?.aspect_ratio?.trim();
  const resolution = fromRequest?.resolution?.trim() || fromAgent?.resolution?.trim();

  return {
    ...(isAspectRatio(aspectRatio) ? { aspect_ratio: aspectRatio } : {}),
    ...(isResolution(resolution) ? { resolution } : {}),
  };
}

const DEFAULT_GEMINI_VIDEO_GEN_DESCRIPTION =
  `Generates short videos with audio from a text prompt, and edits videos it generated earlier.

When to use \`gemini_video_gen\`:
- To create a video, clip, animation or moving footage from a description
- To change a video generated earlier in this conversation

When NOT to use \`gemini_video_gen\`:
- For still images — use an image generation tool instead

Each generated video returns an interaction id. Pass it back as \`previous_interaction_id\` to edit that video instead of generating an unrelated new one.` as const;

const getGeminiVideoGenDescription = () => {
  return process.env.GEMINI_VIDEO_GEN_DESCRIPTION || DEFAULT_GEMINI_VIDEO_GEN_DESCRIPTION;
};

/**
 * The tool's arguments, described from what the selected provider can actually
 * do. A control the provider does not expose is left out entirely rather than
 * offered and ignored: an enum the model can choose from is a promise, and a
 * dropped `duration` spends real money on a clip of the wrong length.
 */
export function buildVideoGenSchema(
  capabilities: VideoAdapterCapabilities = GEMINI_CAPABILITIES,
): ExtendedJsonSchema {
  const properties: NonNullable<ExtendedJsonSchema['properties']> = {
    prompt: {
      type: 'string',
      maxLength: 32000,
      description:
        'A detailed description of the video: subject, action, camera movement, lighting and mood. For an edit, describe only what changes.',
    },
  };

  if (capabilities.maxImages > 0) {
    properties.image_ids = {
      type: 'array',
      items: { type: 'string' },
      maxItems: capabilities.maxImages,
      description:
        capabilities.maxImages > 1
          ? 'Image ids to animate. One image is the starting reference; two are read as first and last frame, and the video interpolates between them. Omit for text-to-video.'
          : 'Id of the image to animate, used as the starting reference. Omit for text-to-video.',
    };
  }

  if (capabilities.editing) {
    properties.previous_interaction_id = {
      type: 'string',
      description:
        'The interaction id of a video generated earlier in this conversation. Pass it to edit that video while preserving everything you do not mention. Omit it to generate a new video.',
    };
  }

  if (capabilities.aspectRatios.length) {
    properties.aspect_ratio = {
      type: 'string',
      enum: [...capabilities.aspectRatios],
      description:
        'Shape of the video, and the ONLY way to set it — writing "vertical" or "9:16" in the prompt does nothing. 16:9 is landscape, 9:16 is portrait. When editing, pass the same value the original used.',
    };
  }

  if (capabilities.resolutions.length) {
    properties.resolution = {
      type: 'string',
      enum: [...capabilities.resolutions],
      description:
        'Output resolution. 720p is the default. Higher resolutions cost proportionally more, so only use them once the direction is approved.',
    };
  }

  if (capabilities.durations.length) {
    properties.duration = {
      type: 'number',
      enum: [...capabilities.durations],
      description: `Length of the clip in seconds. Longer clips cost proportionally more, so stay at ${capabilities.durations[0]} while exploring.`,
    };
  }

  return {
    type: 'object',
    properties,
    required: ['prompt', ...(capabilities.aspectRatios.length ? ['aspect_ratio'] : [])],
  };
}

const geminiVideoGenJsonSchema: ExtendedJsonSchema = buildVideoGenSchema();

export const omniToolkit: {
  readonly gemini_video_gen: {
    readonly name: 'gemini_video_gen';
    readonly description: string;
    readonly description_for_model: string;
    readonly schema: ExtendedJsonSchema;
    readonly responseFormat: 'content_and_artifact';
  };
} = {
  gemini_video_gen: {
    name: 'gemini_video_gen' as const,
    description: getGeminiVideoGenDescription(),
    description_for_model: `Use this tool to generate video from a text description using Gemini Omni.
1. One video per call. Generating a video takes noticeably longer than an image — never call this tool more than once per user request.
2. Describe the shot the way a director would: subject, action, camera movement, lighting, mood. Vague prompts produce weak footage.
3. IMPORTANT: when the user asks to change a video you already generated, pass that video's interaction id as \`previous_interaction_id\` and describe ONLY the change. The model preserves everything you do not mention. Do not re-describe the whole scene.
4. aspect_ratio is a required parameter and the only thing that controls orientation. Describing the format inside the prompt has no effect — Stories, Reels and TikTok need aspect_ratio 9:16, everything else 16:9.
5. Leave resolution at its default while exploring. Only raise it once the user approves a direction, and say that it costs more.
6. Video is generated with audio. Mention sound in the prompt when it matters.
7. To animate an image the user supplied, pass its id in image_ids and describe the MOTION — "make it move" wastes a generation, "slow push in while the steam drifts left" does not. Two ids animate from the first frame to the second.

The returned interaction id is what makes conversational editing work — always reuse it rather than starting over.`,
    schema: geminiVideoGenJsonSchema,
    responseFormat: 'content_and_artifact' as const,
  },
} as const;

export type OmniToolkit = typeof omniToolkit;
