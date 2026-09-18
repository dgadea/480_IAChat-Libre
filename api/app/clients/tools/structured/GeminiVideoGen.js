const { v4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const { ContentTypes, FileContext } = require('librechat-data-provider');
const { omniToolkit, resolveGeminiVideoModel } = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const db = require('~/models');

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

  const { req, userId, GEMINI_API_KEY, GOOGLE_KEY } = fields;
  const videoModel = fields.videoModel || resolveGeminiVideoModel();

  const geminiVideoGenTool = tool(
    async ({ prompt, previous_interaction_id, aspect_ratio, resolution }) => {
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

      const body = { model: videoModel, input: prompt };
      if (previous_interaction_id) {
        body.previous_interaction_id = previous_interaction_id;
      }
      if (aspect_ratio) {
        body.aspect_ratio = aspect_ratio;
      }
      if (resolution) {
        body.response_format = { resolution };
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

      const buffer = Buffer.from(video.data, 'base64');
      const file_id = v4();
      const fileName = `${file_id}.mp4`;
      const fileStrategy = fields.fileStrategy ?? getFileStrategy(req?.config);

      let filepath;
      try {
        const { saveBuffer } = getStrategyFunctions(fileStrategy);
        /** `images` despite being a video: it is the statically served bucket,
         *  while `uploads` is only reachable through the download API and a
         *  `<video src>` cannot load from there. */
        filepath = await saveBuffer({ userId, buffer, fileName, basePath: 'images' });
      } catch (error) {
        logger.error('[GeminiVideoGen] Failed to store video:', error);
        return [
          [
            {
              type: ContentTypes.TEXT,
              text: `The video was generated but could not be stored: ${error.message}`,
            },
          ],
          { content: [], file_ids: [] },
        ];
      }

      try {
        await db.createFile(
          {
            user: userId,
            file_id,
            bytes: buffer.length,
            filepath,
            filename: fileName,
            source: fileStrategy,
            type: video.mimeType,
            context: FileContext.image_generation,
            tenantId: req?.user?.tenantId,
          },
          true,
        );
      } catch (error) {
        logger.warn('[GeminiVideoGen] Failed to record video file metadata:', error);
      }

      const content = [{ type: ContentTypes.VIDEO_URL, video_url: { url: filepath } }];

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
