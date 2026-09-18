const { v4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const { ContentTypes } = require('librechat-data-provider');
const { omniToolkit, resolveGeminiVideoModel } = require('@librechat/api');
const { convertImagesToInlineData } = require('./GeminiImageGen');

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * Pulls the first video block out of an Interactions response. The convenience
 * field `output_video` is SDK-only, so over REST the video lives in the `steps`
 * array alongside the model's thoughts and the echoed user input.
 * @param {object} interaction
 * @returns {{ data: string, mimeType: string } | null}
 */
function extractVideo(interaction) {
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? step.content : [];
    for (const part of content) {
      if (part?.type === 'video' && part.data) {
        return { data: part.data, mimeType: part.mime_type || 'video/mp4' };
      }
    }
  }
  return null;
}

/**
 * Creates the Gemini Omni video generation tool.
 * @param {Object} fields - Configuration fields
 * @param {string} [fields.videoModel] - Video model for this agent, already resolved from its `tool_options`
 * @returns {ReturnType<tool>} - The video generation tool
 */
function createGeminiVideoTool(fields = {}) {
  const override = fields.override ?? false;

  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }

  const { req, imageFiles = [], fileStrategy, GEMINI_API_KEY, GOOGLE_KEY } = fields;
  const videoModel = fields.videoModel || resolveGeminiVideoModel();

  const geminiVideoGenTool = tool(
    async ({ prompt, image_ids, previous_interaction_id, aspect_ratio, resolution }) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }

      const apiKey = GEMINI_API_KEY || GOOGLE_KEY;
      if (!apiKey) {
        return [
          [
            {
              type: ContentTypes.TEXT,
              text: 'Video generation requires a Gemini API key: set GEMINI_API_KEY or GOOGLE_KEY.',
            },
          ],
          { content: [], file_ids: [] },
        ];
      }

      /** `input` takes a bare string for text-to-video, or a typed list when
       *  images come along — one image is a starting reference, two are read as
       *  first and last frame with the motion interpolated between them. */
      let input = prompt;
      if (image_ids?.length) {
        const inlineImages = await convertImagesToInlineData({
          imageFiles,
          image_ids,
          req,
          fileStrategy,
        });
        if (inlineImages.length) {
          input = [
            ...inlineImages.map(({ inlineData }) => ({
              type: 'image',
              data: inlineData.data,
              mime_type: inlineData.mimeType,
            })),
            { type: 'text', text: prompt },
          ];
        }
      }

      const body = { model: videoModel, input };
      if (previous_interaction_id) {
        body.previous_interaction_id = previous_interaction_id;
      }
      /** Both live inside `response_format` alongside `type: 'video'`. At the
       *  top level the API rejects the request, which is what three failed
       *  generations reported as an aspect_ratio error. */
      if (aspect_ratio || resolution) {
        body.response_format = {
          type: 'video',
          ...(aspect_ratio ? { aspect_ratio } : {}),
          ...(resolution ? { resolution } : {}),
        };
      }

      logger.debug('[GeminiVideoGen] Generating video', {
        videoModel,
        aspect_ratio,
        resolution,
        editing: !!previous_interaction_id,
      });

      let interaction;
      try {
        const response = await fetch(`${INTERACTIONS_URL}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        interaction = await response.json();
        if (!response.ok || interaction?.error) {
          const message = interaction?.error?.message || `HTTP ${response.status}`;
          throw new Error(message);
        }
      } catch (error) {
        logger.error('[GeminiVideoGen] API error:', error);
        return [
          [{ type: ContentTypes.TEXT, text: `Video generation failed: ${error.message}` }],
          { content: [], file_ids: [] },
        ];
      }

      const video = extractVideo(interaction);
      if (!video) {
        logger.warn('[GeminiVideoGen] No video in response', { status: interaction?.status });
        return [
          [{ type: ContentTypes.TEXT, text: 'No video was generated. Please try again.' }],
          { content: [], file_ids: [] },
        ];
      }

      /** Handed over as a data URL: the agent artifact pipeline is what stores
       *  generated media and emits the attachment (`callbacks.js`), and a tool
       *  that saves the file itself leaves an unfetchable path in the message
       *  that the next model call then chokes on. */
      const file_id = v4();
      const dataUrl = `data:${video.mimeType};base64,${video.data}`;

      const content = [{ type: ContentTypes.VIDEO_URL, video_url: { url: dataUrl } }];

      /** The interaction id is what makes the next turn an edit rather than a
       *  fresh generation, so it has to reach the model in the text it reads. */
      const textResponse = [
        {
          type: ContentTypes.TEXT,
          text:
            'Video generated.' +
            (interaction?.id ? `\n\ninteraction_id: "${interaction.id}"` : '') +
            `\nresolution: ${resolution || '720p'}` +
            `\naspect_ratio: ${aspect_ratio || '16:9'}`,
        },
      ];

      return [textResponse, { content, file_ids: [file_id] }];
    },
    {
      ...omniToolkit.gemini_video_gen,
      responseFormat: 'content_and_artifact',
    },
  );

  return geminiVideoGenTool;
}

module.exports = createGeminiVideoTool;
module.exports.createGeminiVideoTool = createGeminiVideoTool;
