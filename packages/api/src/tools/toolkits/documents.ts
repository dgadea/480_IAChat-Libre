import { documentGenerationSchema } from 'librechat-data-provider';
import type { TDocumentFormat, TDocumentGenerationConfig } from 'librechat-data-provider';
import type { ExtendedJsonSchema } from '../registry/schema';

/**
 * Resolves the deployment's document settings, filling defaults that reproduce
 * the built-in behavior. Called per request rather than at load, so an
 * operator editing `librechat.yaml` does not need a restart to narrow the
 * formats on offer.
 */
export function resolveDocumentConfig(
  config?: Partial<TDocumentGenerationConfig> | null,
): TDocumentGenerationConfig {
  return documentGenerationSchema.parse(config ?? {});
}

export function isFormatEnabled(
  format: TDocumentFormat,
  config: TDocumentGenerationConfig,
): boolean {
  return config.formats.includes(format);
}

const DEFAULT_DOCUMENT_GEN_DESCRIPTION =
  `Writes the content you provide into a downloadable Word (.docx) or PDF file and attaches it to the conversation.

When to use \`document_gen\`:
- The user asks for a document, report, proposal, letter, memo or contract as a file
- The user asks to "download", "export", "send me" or "print" something you wrote
- The user names a format: .doc, .docx, Word, PDF

When NOT to use \`document_gen\`:
- The user just wants an answer in the chat — writing a file they did not ask for is noise
- The content is a spreadsheet or a slide deck; this tool produces prose documents only` as const;

const getDocumentGenDescription = (): string =>
  process.env.DOCUMENT_GEN_DESCRIPTION || DEFAULT_DOCUMENT_GEN_DESCRIPTION;

const documentGenJsonSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description:
        "The document's title. It becomes the filename the user downloads, so write it the way it should appear in their folder — no extension, no path.",
    },
    content: {
      type: 'string',
      minLength: 1,
      description:
        'The full document body in Markdown. Supported: # headings, **bold**, *italic*, ~~strikethrough~~, `code`, fenced code blocks, ordered and bulleted lists (nesting allowed), > blockquotes, --- rules, and GFM tables. Raw HTML is not rendered. Write the complete document — this text is the file.',
    },
    format: {
      type: 'string',
      enum: ['docx', 'pdf'],
      description:
        'docx for a document the user will edit; pdf for one they will read, print or send. When the user did not say, prefer docx. PDF uses built-in fonts that cover Latin scripts only — use docx for Chinese, Japanese, Korean, Arabic, Hebrew, Greek or Cyrillic text.',
    },
  },
  required: ['title', 'content', 'format'],
};

export const documentToolkit: {
  readonly document_gen: {
    readonly name: 'document_gen';
    readonly description: string;
    readonly description_for_model: string;
    readonly schema: ExtendedJsonSchema;
    readonly responseFormat: 'content_and_artifact';
  };
} = {
  document_gen: {
    name: 'document_gen' as const,
    description: getDocumentGenDescription(),
    description_for_model: `Use this tool to turn text you have written into a real .docx or .pdf file the user can download.

1. Write the whole document in \`content\`. The tool renders exactly what you pass — it does not expand an outline, fill gaps or continue your draft.
2. Do not also paste the full document into your reply. Attach the file, then say in one or two lines what it contains.
3. \`title\` becomes the filename. "Propuesta comercial Acme" is a filename; "Documento" is not.
4. Structure the content: headings for sections, tables for figures, lists for enumerations. A wall of paragraphs makes a worse document than the same text with headings.
5. One call per document. To change a document the user already has, call again with the corrected full content — there is no edit-in-place.
6. Pick the format from what the user will do with it: docx to edit, pdf to read or print. PDF cannot render non-Latin scripts; use docx for those.`,
    schema: documentGenJsonSchema,
    responseFormat: 'content_and_artifact' as const,
  },
} as const;

export type DocumentToolkit = typeof documentToolkit;
