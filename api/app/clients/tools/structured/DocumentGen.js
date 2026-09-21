const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const { ContentTypes } = require('librechat-data-provider');
const {
  documentToolkit,
  getStorageMetadata,
  generateDocument,
  classifyCodeArtifact,
  getExtractedTextFormat,
  extractCodeArtifactText,
  persistGeneratedDocument,
  GENERATED_DOCUMENT_ARTIFACT_KEY,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getRetentionExpiry } = require('~/server/services/Files/retention');
const db = require('~/models');

/**
 * Creates the document generation tool.
 * @param {Object} fields - Configuration fields
 * @param {ServerRequest} fields.req - The request that owns the generated file
 * @returns {ReturnType<tool>} - The document generation tool
 */
function createDocumentTool(fields = {}) {
  const override = fields.override ?? false;

  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }

  const { req } = fields;

  const documentGenTool = tool(
    async ({ title, content, format }) => {
      const result = await generateDocument(
        { title, content, format },
        {
          req,
          logger,
          config: req?.config?.documentGeneration,
          conversationId: req?.body?.conversationId ?? null,
          persist: (document) =>
            persistGeneratedDocument(
              { req, document, conversationId: req?.body?.conversationId ?? null },
              {
                logger,
                getStrategyFunctions,
                getStorageMetadata,
                getRetentionExpiry,
                createFile: db.createFile,
                classifyCodeArtifact,
                extractCodeArtifactText,
                getExtractedTextFormat,
              },
            ),
        },
      );

      const textResponse = [{ type: ContentTypes.TEXT, text: result.text }];
      if (result.document == null) {
        return [textResponse, { content: [], file_ids: [] }];
      }

      /** The stored record travels on the artifact rather than the content: the
       *  agent pipeline emits it as an attachment (`callbacks.js`), while the
       *  text above is all the next model call sees. Putting the document in
       *  both places would replay the whole file into the next request. */
      return [
        textResponse,
        {
          [GENERATED_DOCUMENT_ARTIFACT_KEY]: true,
          documents: [result.document],
          file_ids: [result.document.file_id],
        },
      ];
    },
    {
      ...documentToolkit.document_gen,
      responseFormat: 'content_and_artifact',
    },
  );

  return documentGenTool;
}

module.exports = createDocumentTool;
module.exports.createDocumentTool = createDocumentTool;
