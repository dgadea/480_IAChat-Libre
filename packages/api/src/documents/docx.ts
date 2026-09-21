import {
  Packer,
  Table,
  TextRun,
  Document,
  TableRow,
  Paragraph,
  TableCell,
  WidthType,
  BorderStyle,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  ExternalHyperlink,
} from 'docx';
import type { IParagraphOptions, ParagraphChild } from 'docx';
import type {
  DocBlock,
  DocInline,
  DocumentMeta,
  DocumentRenderer,
  DocumentRenderResult,
} from './types';

const MONOSPACE_FONT = 'Consolas';
const CODE_SHADING = 'F3F4F6';
const HEADER_SHADING = 'EFEFEF';
const RULE_COLOR = 'D0D0D0';
const NUMBERING_REFERENCE = 'librechat-ordered';

const headingStyles: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/**
 * Five ordered levels cycling decimal → letter → roman. Word needs every level
 * it might be asked for declared up front; a list nested deeper than this
 * clamps to the last level rather than losing its numbering.
 */
const orderedLevels = [
  LevelFormat.DECIMAL,
  LevelFormat.LOWER_LETTER,
  LevelFormat.LOWER_ROMAN,
  LevelFormat.DECIMAL,
  LevelFormat.LOWER_LETTER,
].map((format, level) => ({
  level,
  format,
  text: `%${level + 1}.`,
  alignment: AlignmentType.START,
  style: {
    paragraph: {
      indent: { left: 720 * (level + 1), hanging: 360 },
    },
  },
}));

function toTextRuns(inlines: readonly DocInline[]): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  for (const run of inlines) {
    /* `\n` is the hard-break marker the parser emits; Word needs an explicit
     * break rather than a newline inside the run text, which it would
     * otherwise render as a space. */
    const segments = run.text.split('\n');
    segments.forEach((segment, index) => {
      if (index > 0) {
        children.push(new TextRun({ break: 1 }));
      }
      if (segment === '') {
        return;
      }
      const textRun = new TextRun({
        text: segment,
        bold: run.bold,
        italics: run.italic,
        strike: run.strike,
        ...(run.code === true ? { font: MONOSPACE_FONT, shading: { fill: CODE_SHADING } } : {}),
        ...(run.href != null ? { style: 'Hyperlink' } : {}),
      });
      children.push(
        run.href != null ? new ExternalHyperlink({ children: [textRun], link: run.href }) : textRun,
      );
    });
  }
  return children;
}

function paragraph(inlines: readonly DocInline[], options: IParagraphOptions = {}): Paragraph {
  return new Paragraph({ ...options, children: toTextRuns(inlines) });
}

function tableCell(inlines: readonly DocInline[], header: boolean): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: toTextRuns(header ? inlines.map((run) => ({ ...run, bold: true })) : inlines),
      }),
    ],
    ...(header ? { shading: { fill: HEADER_SHADING } } : {}),
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  });
}

/**
 * Word requires every row of a table to declare the same number of cells.
 * Markdown does not, so a short row is padded here rather than producing a
 * document Word reports as corrupt.
 */
function toTable(rows: readonly { header: boolean; cells: DocInline[][] }[]): Table {
  const columns = rows.reduce((widest, row) => Math.max(widest, row.cells.length), 0);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row) =>
        new TableRow({
          tableHeader: row.header,
          children: Array.from({ length: columns }, (_unused, column) =>
            tableCell(row.cells[column] ?? [], row.header),
          ),
        }),
    ),
  });
}

function blockToChildren(block: DocBlock, listInstance: number): (Paragraph | Table)[] {
  switch (block.type) {
    case 'heading':
      return [paragraph(block.inlines, { heading: headingStyles[block.level] })];

    case 'paragraph':
      return [paragraph(block.inlines, { spacing: { after: 160 } })];

    case 'quote':
      return [
        paragraph(block.inlines, {
          indent: { left: 480 },
          spacing: { after: 160 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: RULE_COLOR, space: 12 },
          },
        }),
      ];

    case 'list':
      return block.items.map((item) =>
        paragraph(item.inlines, {
          ...(item.ordered
            ? {
                numbering: {
                  reference: NUMBERING_REFERENCE,
                  level: Math.min(item.level, orderedLevels.length - 1),
                  instance: listInstance,
                },
              }
            : { bullet: { level: Math.min(item.level, 4) } }),
        }),
      );

    case 'table':
      return [toTable(block.rows), new Paragraph({ spacing: { after: 160 } })];

    case 'code':
      return block.lines.map(
        (line, index) =>
          new Paragraph({
            shading: { fill: CODE_SHADING },
            spacing: index === block.lines.length - 1 ? { after: 160 } : {},
            children: [new TextRun({ text: line, font: MONOSPACE_FONT, size: 20 })],
          }),
      );

    case 'rule':
      return [
        new Paragraph({
          spacing: { before: 120, after: 160 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } },
        }),
      ];
  }
}

/** Renders the shared block model to an Office Open XML document. */
export const docxRenderer: DocumentRenderer = {
  format: 'docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  extension: 'docx',

  async render(blocks: DocBlock[], meta: DocumentMeta): Promise<DocumentRenderResult> {
    const children: (Paragraph | Table)[] = [];
    let listInstance = 0;
    for (const block of blocks) {
      if (block.type === 'list') {
        listInstance += 1;
      }
      children.push(...blockToChildren(block, listInstance));
    }

    const document = new Document({
      title: meta.title,
      creator: meta.author ?? 'LibreChat',
      description: meta.description,
      numbering: {
        config: [{ reference: NUMBERING_REFERENCE, levels: orderedLevels }],
      },
      styles: {
        default: {
          document: {
            run: { font: 'Calibri', size: 22 },
            paragraph: { spacing: { line: 276 } },
          },
        },
      },
      sections: [{ children: children.length > 0 ? children : [new Paragraph({})] }],
    });

    return { buffer: await Packer.toBuffer(document), warnings: [] };
  },
};
