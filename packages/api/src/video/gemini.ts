import { logger } from '@librechat/data-schemas';
import type {
  VideoAdapter,
  ResolvedVideoProvider,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoAdapterCapabilities,
} from './types';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Omni takes no length argument and interpolates between at most two frames,
 *  so `durations` is empty rather than defaulted — the tool reads the absence
 *  as "do not offer this control" instead of inventing a value the API drops. */
export const GEMINI_CAPABILITIES: VideoAdapterCapabilities = {
  aspectRatios: ['16:9', '9:16'],
  resolutions: ['360p', '720p', '1080p', '4k'],
  durations: [],
  maxImages: 2,
  editing: true,
};

interface InteractionPart {
  type?: string;
  data?: string;
  mime_type?: string;
}

interface InteractionStep {
  content?: InteractionPart[];
}

interface InteractionResponse {
  id?: string;
  status?: string;
  steps?: InteractionStep[];
  error?: { message?: string };
}

/**
 * Pulls the first video block out of an Interactions response. The convenience
 * field `output_video` is SDK-only, so over REST the video sits in `steps`
 * beside the model's thoughts and the echoed input.
 */
function extractVideo(interaction: InteractionResponse): InteractionPart | null {
  for (const step of interaction.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part?.type === 'video' && part.data) {
        return part;
      }
    }
  }
  return null;
}

/**
 * Gemini Omni returns the finished video in the same response rather than a job
 * to poll, which is why this adapter has no polling loop — unlike the queue-based
 * providers a future adapter will need.
 */
export function createGeminiVideoAdapter(provider: ResolvedVideoProvider): VideoAdapter {
  const baseURL = provider.baseURL || DEFAULT_BASE_URL;

  return {
    capabilities: GEMINI_CAPABILITIES,

    async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
      if (!provider.apiKey) {
        throw new Error(
          `Video provider "${provider.name}" has no API key. Set one in librechat.yaml.`,
        );
      }

      /** `input` takes a bare string for text-to-video, or a typed list when
       *  images come along — one image is a starting reference, two are read as
       *  first and last frame with the motion interpolated between them. */
      const images = request.images ?? [];
      const body: Record<string, unknown> = {
        model: request.model,
        input: images.length
          ? [
              ...images.map((image) => ({
                type: 'image',
                data: image.data,
                mime_type: image.mimeType,
              })),
              { type: 'text', text: request.prompt },
            ]
          : request.prompt,
      };
      if (request.previousId) {
        body.previous_interaction_id = request.previousId;
      }
      /** Both live inside `response_format` alongside `type: 'video'`; at the
       *  top level the API rejects the request. */
      if (request.aspectRatio || request.resolution) {
        body.response_format = {
          type: 'video',
          ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
          ...(request.resolution ? { resolution: request.resolution } : {}),
        };
      }

      const response = await fetch(`${baseURL}/interactions?key=${provider.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: request.signal,
      });

      const interaction = (await response.json()) as InteractionResponse;
      if (!response.ok || interaction.error) {
        throw new Error(interaction.error?.message || `HTTP ${response.status}`);
      }

      const video = extractVideo(interaction);
      if (!video?.data) {
        logger.warn('[video/gemini] No video in response', { status: interaction.status });
        throw new Error('The provider returned no video.');
      }

      return {
        buffer: Buffer.from(video.data, 'base64'),
        mimeType: video.mime_type || 'video/mp4',
        previousId: interaction.id,
      };
    },
  };
}
