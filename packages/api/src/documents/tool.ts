import type { TDocumentGenerationConfig } from 'librechat-data-provider';
import type { StoredDocument } from './persist';
import type { ServerRequest } from '~/types';
import { resolveDocumentConfig, isFormatEnabled } from '~/tools/toolkits/documents';
import { isDocumentFormat, renderDocument } from './render';

/**
 * Marks a tool artifact as carrying already-stored generated documents. The
 * attachment pipeline dispatches on this rather than on the tool's name, so a
 * second document-producing tool needs no change there.
 */
export const GENERATED_DOCUMENT_ARTIFACT_KEY = '__librechat_generated_document';

export interface GeneratedDocumentArtifact {
  [GENERATED_DOCUMENT_ARTIFACT_KEY]: true;
  documents: StoredDocument[];
}

/** Narrows a tool output's artifact to the generated-document shape. Both the
 *  flag and a non-empty `documents` array are required: an artifact that
 *  claims the shape without carrying files would emit nothing. */
export function isGeneratedDocumentArtifact(
  artifact: unknown,
): artifact is GeneratedDocumentArtifact {
  if (artifact == null || typeof artifact !== 'object') {
    return false;
  }
  const candidate = artifact as Partial<GeneratedDocumentArtifact>;
  return (
    candidate[GENERATED_DOCUMENT_ARTIFACT_KEY] === true &&
    Array.isArray(candidate.documents) &&
    candidate.documents.length > 0
  );
}

/** What the tool hands back: text the model reads, and the stored file the
 *  attachment pipeline emits. `document` is null on every refusal path, which
 *  is what keeps a failed call from producing an empty attachment. */
export interface DocumentToolResult {
  text: string;
  document: StoredDocument | null;
}

export interface GenerateDocumentInput {
  title?: string;
  content?: string;
  format?: string;
}

export interface GenerateDocumentDeps {
  req: ServerRequest & Required<Pick<ServerRequest, 'user' | 'config'>>;
  conversationId?: string | null;
  config?: Partial<TDocumentGenerationConfig> | null;
  persist: (document: Awaited<ReturnType<typeof renderDocument>>) => Promise<StoredDocument>;
  logger: { warn: (message: string) => void; debug: (message: string) => void };
}

const refuse = (text: string): DocumentToolResult => ({ text, document: null });

/**
 * Renders a model-authored document and stores it.
 *
 * Every rejection returns text rather than throwing: a tool error surfaces to
 * the user as a failed run, while a sentence the model can read lets it fix
 * the call or tell the user what went wrong — a format an operator disabled is
 * something the conversation can route around, not a crash.
 */
export async function generateDocument(
  { title, content, format }: GenerateDocumentInput,
  deps: GenerateDocumentDeps,
): Promise<DocumentToolResult> {
  const settings = resolveDocumentConfig(deps.config);

  if (typeof title !== 'string' || title.trim() === '') {
    return refuse('Missing required field: title.');
  }
  if (typeof content !== 'string' || content.trim() === '') {
    return refuse('Missing required field: content. Pass the full document body as Markdown.');
  }
  if (!isDocumentFormat(format)) {
    return refuse(
      `Unsupported format "${String(format)}". Supported formats: ${settings.formats.join(', ')}.`,
    );
  }
  if (!isFormatEnabled(format, settings)) {
    return refuse(
      `The ${format} format is disabled on this deployment. Available formats: ${settings.formats.join(', ')}.`,
    );
  }
  if (content.length > settings.maxInputLength) {
    return refuse(
      `The document is ${content.length} characters, over the ${settings.maxInputLength} limit. Split it into sections and generate them as separate documents.`,
    );
  }

  const rendered = await renderDocument({
    format,
    markdown: content,
    meta: { title: title.trim(), author: 'LibreChat' },
  });

  const document = await deps.persist(rendered);

  const summary = [
    `Created ${document.filename} (${format.toUpperCase()}, ${document.bytes} bytes).`,
    'The file is attached to this message — do not repeat its full text in your reply.',
    ...rendered.warnings,
  ].join('\n');

  return { text: summary, document };
}
