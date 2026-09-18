import type { AgentToolOptions } from 'librechat-data-provider';
import type { ExtendedJsonSchema } from '../registry/schema';
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

const geminiVideoGenJsonSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      maxLength: 32000,
      description:
        'A detailed description of the video: subject, action, camera movement, lighting and mood. For an edit, describe only what changes.',
    },
    previous_interaction_id: {
      type: 'string',
      description:
        'The interaction id of a video generated earlier in this conversation. Pass it to edit that video while preserving everything you do not mention. Omit it to generate a new video.',
    },
    aspect_ratio: {
      type: 'string',
      enum: ['16:9', '9:16'],
      description: 'Shape of the video. 16:9 is landscape (default), 9:16 is portrait.',
    },
    resolution: {
      type: 'string',
      enum: ['360p', '720p', '1080p', '4k'],
      description:
        'Output resolution. 720p is the default. Higher resolutions cost proportionally more, so only use them once the direction is approved.',
    },
  },
  required: ['prompt'],
};

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
4. Use aspect_ratio 9:16 for vertical formats and 16:9 for everything else.
5. Leave resolution at its default while exploring. Only raise it once the user approves a direction, and say that it costs more.
6. Video is generated with audio. Mention sound in the prompt when it matters.

The returned interaction id is what makes conversational editing work — always reuse it rather than starting over.`,
    schema: geminiVideoGenJsonSchema,
    responseFormat: 'content_and_artifact' as const,
  },
} as const;

export type OmniToolkit = typeof omniToolkit;
