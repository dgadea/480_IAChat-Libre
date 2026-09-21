import PDFDocument from 'pdfkit';
import type {
  DocBlock,
  DocInline,
  DocumentMeta,
  DocumentRenderer,
  DocumentRenderResult,
} from './types';

type PDFKitDocument = InstanceType<typeof PDFDocument>;

const BODY_SIZE = 11;
const CODE_SIZE = 9.5;
const MARGIN = 64;
const LINK_COLOR = '#1a5fb4';
const MUTED_COLOR = '#6b7280';
const RULE_COLOR = '#d1d5db';
const CODE_BACKGROUND = '#f3f4f6';
const HEADER_BACKGROUND = '#efefef';

const headingSizes: Record<number, number> = { 1: 22, 2: 17, 3: 14, 4: 12, 5: 11, 6: 11 };

/**
 * Code points the built-in PDF fonts can encode. PDFKit's standard fonts are
 * WinAnsi (CP1252) only — ASCII, the Latin-1 supplement, and the handful of
 * typographic characters Microsoft placed in the C1 range. Anything outside
 * this set has no glyph in a font we ship, so it is dropped and counted; the
 * caller surfaces the count so a document that lost characters says so rather
 * than quietly arriving incomplete. Embedding a Unicode TTF is what lifts
 * this, and is the only thing that would.
 */
const CP1252_C1_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/** Characters with a faithful ASCII rendering, mapped rather than dropped. */
const TRANSLITERATIONS: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '⇒': '=>',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '≈': '~=',
  '★': '*',
  '☆': '*',
  '✓': 'v',
  '✔': 'v',
  '✗': 'x',
  '✘': 'x',
  '−': '-',
  '‑': '-',
};
/**
 * Invisible characters, keyed by code point rather than by literal. A
 * zero-width space written as itself is unreadable in source, and a formatter
 * will happily rewrite an escape sequence into one, so these are named by
 * their number instead.
 */
const INVISIBLE_REPLACEMENTS: ReadonlyMap<number, string> = new Map([
  [0x00a0, ' '],
  [0x200b, ''],
  [0xfeff, ''],
]);

interface SanitizedText {
  text: string;
  dropped: number;
}

export function sanitizeForStandardFonts(input: string): SanitizedText {
  let dropped = 0;
  let text = '';
  for (const character of input.normalize('NFC')) {
    const replacement = TRANSLITERATIONS[character];
    if (replacement != null) {
      text += replacement;
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    const invisible = INVISIBLE_REPLACEMENTS.get(code);
    if (invisible != null) {
      text += invisible;
      continue;
    }
    const encodable =
      character === '\n' ||
      character === '\t' ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      CP1252_C1_EXTRAS.has(code);
    if (encodable) {
      text += character;
      continue;
    }
    dropped += 1;
  }
  return { text, dropped };
}

function fontFor(run: DocInline): string {
  if (run.code === true) {
    if (run.bold === true) {
      return 'Courier-Bold';
    }
    return run.italic === true ? 'Courier-Oblique' : 'Courier';
  }
  if (run.bold === true) {
    return run.italic === true ? 'Helvetica-BoldOblique' : 'Helvetica-Bold';
  }
  return run.italic === true ? 'Helvetica-Oblique' : 'Helvetica';
}

/** Accumulates the characters no built-in font could encode, so one document
 *  yields one warning instead of one per run. */
class DroppedCharacterCounter {
  private count = 0;

  take(input: string): string {
    const { text, dropped } = sanitizeForStandardFonts(input);
    this.count += dropped;
    return text;
  }

  get total(): number {
    return this.count;
  }
}

interface InlineOptions {
  indent?: number;
  size?: number;
  color?: string;
  bold?: boolean;
}

function writeInlines(
  doc: PDFKitDocument,
  inlines: readonly DocInline[],
  counter: DroppedCharacterCounter,
  options: InlineOptions = {},
): void {
  const size = options.size ?? BODY_SIZE;
  const runs = inlines
    .map((run) => ({ ...run, text: counter.take(run.text) }))
    .filter((run) => run.text !== '');

  if (runs.length === 0) {
    doc.moveDown(0.5);
    return;
  }

  runs.forEach((run, index) => {
    const bold = options.bold === true || run.bold === true;
    doc
      .font(fontFor({ ...run, bold }))
      .fontSize(run.code === true ? size - 1 : size)
      .fillColor(run.href != null ? LINK_COLOR : (options.color ?? 'black'));
    /* Only the first call of a continued run carries the paragraph geometry;
     * repeating `indent` on each would stack the offsets. */
    doc.text(run.text, {
      continued: index < runs.length - 1,
      ...(index === 0 && options.indent != null ? { indent: options.indent } : {}),
      ...(run.href != null ? { link: run.href, underline: true } : {}),
    });
  });
  doc.fillColor('black');
}

function writeCode(
  doc: PDFKitDocument,
  lines: readonly string[],
  counter: DroppedCharacterCounter,
): void {
  doc.font('Courier').fontSize(CODE_SIZE);
  const lineHeight = doc.currentLineHeight(true);
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (const line of lines) {
    /* Draw the band per line rather than once for the block: a block that
     * crosses a page boundary would otherwise paint its background on the
     * first page and its text on the second. */
    if (doc.y + lineHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    doc
      .rect(doc.page.margins.left, doc.y - 1, width, lineHeight + 2)
      .fill(CODE_BACKGROUND)
      .fillColor('black')
      .font('Courier')
      .fontSize(CODE_SIZE)
      .text(counter.take(line) || ' ', doc.page.margins.left + 6, doc.y, {
        width: width - 12,
        lineBreak: false,
      });
  }
  doc.moveDown(0.6);
}

function writeTable(
  doc: PDFKitDocument,
  rows: readonly { header: boolean; cells: DocInline[][] }[],
  counter: DroppedCharacterCounter,
): void {
  const columns = rows.reduce((widest, row) => Math.max(widest, row.cells.length), 0);
  const data = rows.map((row) =>
    Array.from({ length: columns }, (_unused, column) => {
      const cell = row.cells[column] ?? [];
      const text = counter.take(cell.map((run) => run.text).join(''));
      return {
        text,
        type: row.header ? ('TH' as const) : ('TD' as const),
        font: { family: row.header ? 'Helvetica-Bold' : 'Helvetica', size: BODY_SIZE - 1 },
        ...(row.header ? { backgroundColor: HEADER_BACKGROUND } : {}),
      };
    }),
  );

  doc.table({
    data,
    defaultStyle: { border: 0.5, borderColor: RULE_COLOR, padding: 5 },
  });
  doc.moveDown(0.6);
}

function writeBlock(doc: PDFKitDocument, block: DocBlock, counter: DroppedCharacterCounter): void {
  switch (block.type) {
    case 'heading':
      doc.moveDown(block.level <= 2 ? 0.8 : 0.5);
      writeInlines(doc, block.inlines, counter, {
        size: headingSizes[block.level] ?? BODY_SIZE,
        bold: true,
      });
      doc.moveDown(0.35);
      return;

    case 'paragraph':
      writeInlines(doc, block.inlines, counter);
      doc.moveDown(0.5);
      return;

    case 'quote': {
      const top = doc.y;
      writeInlines(doc, block.inlines, counter, { indent: 18, color: MUTED_COLOR });
      doc
        .save()
        .lineWidth(2)
        .strokeColor(RULE_COLOR)
        .moveTo(doc.page.margins.left + 4, top)
        .lineTo(doc.page.margins.left + 4, doc.y)
        .stroke()
        .restore();
      doc.moveDown(0.5);
      return;
    }

    case 'list':
      for (const item of block.items) {
        const marker = item.ordered ? `${item.index}.` : '•';
        writeInlines(doc, [{ text: `${marker}  ` }, ...item.inlines], counter, {
          indent: 14 * (item.level + 1),
        });
      }
      doc.moveDown(0.5);
      return;

    case 'table':
      writeTable(doc, block.rows, counter);
      return;

    case 'code':
      writeCode(doc, block.lines, counter);
      return;

    case 'rule':
      doc.moveDown(0.3);
      doc
        .save()
        .lineWidth(1)
        .strokeColor(RULE_COLOR)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke()
        .restore();
      doc.moveDown(0.6);
      return;
  }
}

/** Renders the shared block model to a PDF using PDFKit's built-in fonts. */
export const pdfRenderer: DocumentRenderer = {
  format: 'pdf',
  mimeType: 'application/pdf',
  extension: 'pdf',

  render(blocks: DocBlock[], meta: DocumentMeta): Promise<DocumentRenderResult> {
    return new Promise<DocumentRenderResult>((resolve, reject) => {
      const counter = new DroppedCharacterCounter();
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: {
          Title: meta.title,
          Author: meta.author ?? 'LibreChat',
          ...(meta.description != null ? { Subject: meta.description } : {}),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => {
        const warnings =
          counter.total > 0
            ? [
                `${counter.total} character(s) outside the PDF built-in font range were omitted. Offer the .docx format when the text is not Latin-script.`,
              ]
            : [];
        resolve({ buffer: Buffer.concat(chunks), warnings });
      });

      try {
        doc.font('Helvetica').fontSize(BODY_SIZE);
        for (const block of blocks) {
          writeBlock(doc, block, counter);
        }
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  },
};
