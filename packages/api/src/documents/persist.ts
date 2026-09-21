import { v4 } from 'uuid';
import { FileContext } from 'librechat-data-provider';
import type { FileSources } from 'librechat-data-provider';
import type { extractCodeArtifactText } from '~/files/code/extract';
import type { getExtractedTextFormat } from '~/files/code/extract';
import type { classifyCodeArtifact } from '~/files/code/classify';
import type { RetentionExpiry } from '~/files/retention';
import type { RenderedDocument } from './types';
import type { ServerRequest } from '~/types';

/**
 * A persisted generated document, as the attachment pipeline needs it. Plain
 * data on purpose: the storage engine stays behind the data-schemas method the
 * caller injects, so nothing here ties a consumer to Mongo.
 */
export interface StoredDocument {
  file_id: string;
  filename: string;
  filepath: string;
  type: string;
  bytes: number;
  user: string;
  source: FileSources;
  context: FileContext;
  conversationId?: string | null;
  tenantId?: string | null;
  text: string | null;
  textFormat: string | null;
  storageKey?: string;
  storageRegion?: string;
  expiredAt?: Date | null;
}

export interface DocumentPersistenceDeps {
  getStrategyFunctions: (source: FileSources) => {
    saveBuffer?: (input: {
      userId: string;
      buffer: Buffer;
      fileName: string;
      basePath: string;
      tenantId?: string;
    }) => Promise<string>;
  };
  getStorageMetadata: (file: { filepath: string; source: FileSources }) => {
    storageKey?: string;
    storageRegion?: string;
  };
  getRetentionExpiry: (req: ServerRequest) => Promise<RetentionExpiry>;
  createFile: (data: StoredDocument, disableToolCall: boolean) => Promise<unknown>;
  classifyCodeArtifact: typeof classifyCodeArtifact;
  extractCodeArtifactText: typeof extractCodeArtifactText;
  getExtractedTextFormat: typeof getExtractedTextFormat;
  logger: { warn: (message: string) => void; debug: (message: string) => void };
}

export interface PersistDocumentInput {
  req: ServerRequest & Required<Pick<ServerRequest, 'user' | 'config'>>;
  document: RenderedDocument;
  conversationId?: string | null;
}

/**
 * Stores a rendered document and produces its inline preview in one pass.
 *
 * The preview is what makes the attachment worth more than a download link:
 * `extractCodeArtifactText` turns the docx into the same sanitized HTML the
 * code-execution artifacts use, so a generated document lands in the artifacts
 * panel rather than as an opaque file card. A format with no preview producer
 * (pdf today) simply stores `text: null` and falls back to that card, which is
 * why extraction failure is logged rather than thrown — losing the preview is
 * not losing the document.
 */
export async function persistGeneratedDocument(
  { req, document, conversationId }: PersistDocumentInput,
  deps: DocumentPersistenceDeps,
): Promise<StoredDocument> {
  const source = req.config.fileStrategy as FileSources;
  const { saveBuffer } = deps.getStrategyFunctions(source);
  if (saveBuffer == null) {
    throw new Error(`File strategy "${source}" cannot store a generated document`);
  }

  const file_id = v4();
  const retentionExpiryPromise = deps.getRetentionExpiry(req);
  const filepath = await saveBuffer({
    userId: req.user.id,
    buffer: document.buffer,
    fileName: `${file_id}__${document.filename}`,
    basePath: 'uploads',
    tenantId: req.user.tenantId,
  });

  let text: string | null = null;
  let textFormat: string | null = null;
  try {
    const category = deps.classifyCodeArtifact(document.filename, document.mimeType);
    text = await deps.extractCodeArtifactText(
      document.buffer,
      document.filename,
      document.mimeType,
      category,
    );
    textFormat = deps.getExtractedTextFormat(document.filename, document.mimeType, text) ?? null;
  } catch (error) {
    deps.logger.warn(
      `[persistGeneratedDocument] Preview extraction failed for "${document.filename}": ${(error as Error).message}`,
    );
  }

  const stored: StoredDocument = {
    file_id,
    filepath,
    text,
    textFormat,
    source,
    conversationId,
    type: document.mimeType,
    filename: document.filename,
    bytes: document.buffer.length,
    user: req.user.id,
    tenantId: req.user.tenantId,
    context: FileContext.document_generation,
    ...deps.getStorageMetadata({ filepath, source }),
    ...(await retentionExpiryPromise),
  };

  await deps.createFile(stored, true);
  return stored;
}
