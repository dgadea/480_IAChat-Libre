/** One run of text carrying the marks that apply to it. Renderers map these
 *  onto their own primitives; nothing here is docx- or pdf-specific. */
export interface DocInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
}

/**
 * A list entry flattened out of the source nesting. `level` is the zero-based
 * depth and `ordered` belongs to the entry rather than the block, so a bulleted
 * list nested under a numbered one survives the round trip — the two renderers
 * each read depth and marker independently instead of re-deriving the tree.
 */
export interface DocListItem {
  level: number;
  ordered: boolean;
  /** Number to print for an ordered entry, counted within its own level run. */
  index: number;
  inlines: DocInline[];
}

export interface DocTableRow {
  header: boolean;
  cells: DocInline[][];
}

export type DocHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type DocBlock =
  | { type: 'heading'; level: DocHeadingLevel; inlines: DocInline[] }
  | { type: 'paragraph'; inlines: DocInline[] }
  | { type: 'quote'; inlines: DocInline[] }
  | { type: 'list'; items: DocListItem[] }
  | { type: 'table'; rows: DocTableRow[] }
  | { type: 'code'; language: string | null; lines: string[] }
  | { type: 'rule' };

export type DocumentFormat = 'docx' | 'pdf';

export interface DocumentMeta {
  title: string;
  author?: string;
  description?: string;
}

/**
 * A rendered document, plus anything the renderer had to compromise on. The
 * warnings travel back to the model rather than to a log, because the caller
 * that can act on them — by offering the other format — is the conversation.
 */
export interface DocumentRenderResult {
  buffer: Buffer;
  warnings: string[];
}

/**
 * What a renderer must implement. One method per format: a third format is a
 * new file registered in {@link documentRenderers}, not a branch inside the
 * tool or the caller.
 */
export interface DocumentRenderer {
  readonly format: DocumentFormat;
  readonly mimeType: string;
  readonly extension: string;
  render(blocks: DocBlock[], meta: DocumentMeta): Promise<DocumentRenderResult>;
}

export interface RenderedDocument {
  buffer: Buffer;
  mimeType: string;
  /** Extension without the leading dot. */
  extension: string;
  format: DocumentFormat;
  filename: string;
  warnings: string[];
}
