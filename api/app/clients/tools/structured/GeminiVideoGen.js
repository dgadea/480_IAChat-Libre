const { v4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const { ContentTypes } = require('librechat-data-provider');
const {
  omniToolkit,
  generateVideo,
  recordVideoUsage,
  getBalanceConfig,
  buildVideoGenSchema,
  applyVideoDirection,
  getTransactionsConfig,
  prepareVideoGeneration,
} = require('@librechat/api');
const { convertImagesToInlineData } = require('./GeminiImageGen');
const { spendTokens } = require('~/models');

const TOOL_ID = 'gemini_video_gen';

const textOnly = (text) => [[{ type: ContentTypes.TEXT, text }], { content: [], file_ids: [] }];

/**
 * Creates the video generation tool.
 * @param {Object} fields - Configuration fields
 * @param {string} [fields.videoModel] - Model for this agent, used when the deployment configures no provider
 * @param {import('librechat-data-provider').AgentToolOptions} [fields.toolOptions] - The agent's own settings
 * @returns {ReturnType<tool>} - The video generation tool
 */
function createGeminiVideoTool(fields = {}) {
  const override = fields.override ?? false;

  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }

  const { req, imageFiles = [], userId, fileStrategy, GEMINI_API_KEY, GOOGLE_KEY } = fields;
  /** Resolved by the caller from the composer's controls and the agent's own
   *  settings. Set deliberately by the user, so they win over the model's
   *  arguments rather than merely filling in for a missing one. */
  const videoParams = fields.videoParams ?? {};

  /** Resolved once, here rather than per call, because the argument schema the
   *  model reads is built from the selected model's capabilities — resolving
   *  the provider later would leave the two free to disagree. */
  let prepared = null;
  let setupError = null;
  try {
    prepared = prepareVideoGeneration({
      config: req?.config?.videoGeneration,
      toolOptions: fields.toolOptions,
      toolId: TOOL_ID,
      fallback: {
        apiKey: GEMINI_API_KEY || GOOGLE_KEY,
        model: fields.videoModel,
      },
    });
  } catch (error) {
    /** A provider naming an adapter nothing implements must not take the whole
     *  agent down with it: the tool loads and reports the misconfiguration to
     *  the one conversation that calls it. */
    setupError = error;
    logger.error('[GeminiVideoGen] Could not resolve a video provider:', error);
  }

  const geminiVideoGenTool = tool(
    async (
      { prompt, image_ids, previous_interaction_id, aspect_ratio, resolution, duration },
      runnableConfig,
    ) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }

      if (setupError) {
        return textOnly(`Video generation is misconfigured: ${setupError.message}`);
      }

      if (!prepared) {
        return textOnly(
          'Video generation is not configured: add a `videoGeneration` provider in librechat.yaml, or set GEMINI_API_KEY or GOOGLE_KEY.',
        );
      }

      let images;
      if (image_ids?.length) {
        const inlineImages = await convertImagesToInlineData({
          imageFiles,
          image_ids,
          req,
          fileStrategy,
        });
        if (inlineImages.length < image_ids.length) {
          /** The converter logs and skips an image it cannot read, so without
           *  this the clip generates from the prompt alone and silently ignores
           *  the reference — a paid generation that answers a different brief. */
          logger.error('[GeminiVideoGen] Could not load reference images', {
            requested: image_ids.length,
            loaded: inlineImages.length,
          });
          return textOnly(
            `Could not load ${image_ids.length - inlineImages.length} of the ${image_ids.length} reference image(s). No video was generated — generating without the reference would have produced an unrelated clip. Ask the user to re-upload the image.`,
          );
        }
        images = inlineImages.map(({ inlineData }) => ({
          data: inlineData.data,
          mimeType: inlineData.mimeType,
        }));
      }

      const effectiveAspectRatio = videoParams.aspect_ratio || aspect_ratio;
      const effectiveResolution = videoParams.resolution || resolution;
      /** Treatment and sound have no API field, so they are appended to the
       *  prompt rather than passed as arguments — direction the renderer reads,
       *  not a setting the provider enforces. */
      const directedPrompt = applyVideoDirection(prompt, videoParams);

      logger.debug('[GeminiVideoGen] Generating video', {
        provider: prepared.provider,
        model: prepared.model,
        aspect_ratio: effectiveAspectRatio,
        resolution: effectiveResolution,
        treatment: videoParams.treatment,
        sound: videoParams.sound,
        overridden: Object.keys(videoParams).length > 0,
        editing: !!previous_interaction_id,
      });

      let outcome;
      try {
        outcome = await generateVideo({
          prepared,
          request: {
            prompt: directedPrompt,
            images,
            duration,
            previousId: previous_interaction_id,
            aspectRatio: effectiveAspectRatio,
            resolution: effectiveResolution,
            signal: runnableConfig?.signal ? AbortSignal.any([runnableConfig.signal]) : undefined,
          },
        });
      } catch (error) {
        logger.error('[GeminiVideoGen] Generation failed:', error);
        return textOnly(`Video generation failed: ${error.message}`);
      }

      recordVideoUsage({
        usage: outcome.usage,
        spendTokens,
        txData: {
          user: userId ?? req?.user?.id,
          model: prepared.model,
          conversationId: runnableConfig?.configurable?.thread_id,
          messageId:
            runnableConfig?.configurable?.run_id ??
            runnableConfig?.configurable?.requestBody?.messageId,
          balance: getBalanceConfig(req?.config),
          transactions: getTransactionsConfig(req?.config),
        },
      });

      /** Handed over as a data URL: the agent artifact pipeline is what stores
       *  generated media and emits the attachment (`callbacks.js`), and a tool
       *  that saves the file itself leaves an unfetchable path in the message
       *  that the next model call then chokes on. */
      const file_id = v4();
      const dataUrl = `data:${outcome.mimeType};base64,${outcome.buffer.toString('base64')}`;

      const content = [{ type: ContentTypes.VIDEO_URL, video_url: { url: dataUrl } }];

      /** The interaction id is what makes the next turn an edit rather than a
       *  fresh generation, so it has to reach the model in the text it reads. */
      const textResponse = [
        {
          type: ContentTypes.TEXT,
          text:
            'Video generated.' +
            (outcome.previousId ? `\n\ninteraction_id: "${outcome.previousId}"` : '') +
            `\nresolution: ${effectiveResolution || '720p'}` +
            `\naspect_ratio: ${effectiveAspectRatio || '16:9'}`,
        },
      ];

      return [textResponse, { content, file_ids: [file_id] }];
    },
    {
      ...omniToolkit.gemini_video_gen,
      /** Anything the user fixed in the composer is dropped from the schema:
       *  the model cannot choose it, so offering the argument only invites a
       *  value that the override then discards — visible in the call card as a
       *  parameter contradicting the finished clip. */
      schema: buildVideoGenSchema(prepared?.capabilities, videoParams),
      responseFormat: 'content_and_artifact',
    },
  );

  return geminiVideoGenTool;
}

module.exports = createGeminiVideoTool;
module.exports.createGeminiVideoTool = createGeminiVideoTool;
