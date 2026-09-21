import MarkdownIt from 'markdown-it';
import type { Token, MarkdownIt as MarkdownItParser } from 'markdown-it';
import type { DocBlock, DocInline, DocTableRow, DocListItem, DocHeadingLevel } from './types';

/** One open list in the source nesting: how entries are marked and how far
 *  the counter has advanced at that depth. */
interface ListFrame {
  ordered: boolean;
  counter: number;
}

/**
 * `html: false` is the load-bearing option, not a preference. Raw HTML in the
 * source would otherwise reach a renderer that has no notion of markup and
 * would either drop it or emit it as literal text; refusing it at the parser
 * keeps model-authored content from carrying anything but the marks this
 * module models.
 */
const parser: MarkdownItParser = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: false,
  typographer: false,
});

const headingLevels: Record<string, DocHeadingLevel> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** Collapses an inline token's children into formatted runs. Mark state is
 *  kept as depth counters so nested emphasis closes in the right order. */
function toInlines(children: readonly Token[] | null): DocInline[] {
  if (!children) {
    return [];
  }
  const inlines: DocInline[] = [];
  let bold = 0;
  let italic = 0;
  let strike = 0;
  let href: string | undefined;

  const push = (text: string, code?: boolean): void => {
    if (!text) {
      return;
    }
    const run: DocInline = { text };
    if (bold > 0) {
      run.bold = true;
    }
    if (italic > 0) {
      run.italic = true;
    }
    if (strike > 0) {
      run.strike = true;
    }
    if (code === true) {
      run.code = true;
    }
    if (href != null) {
      run.href = href;
    }
    inlines.push(run);
  };

  for (const token of children) {
    switch (token.type) {
      case 'text':
        push(token.content);
        break;
      case 'code_inline':
        push(token.content, true);
        break;
      case 'strong_open':
        bold += 1;
        break;
      case 'strong_close':
        bold -= 1;
        break;
      case 'em_open':
        italic += 1;
        break;
      case 'em_close':
        italic -= 1;
        break;
      case 's_open':
        strike += 1;
        break;
      case 's_close':
        strike -= 1;
        break;
      case 'link_open': {
        const target = token.attrGet('href');
        href = typeof target === 'string' ? target : undefined;
        break;
      }
      case 'link_close':
        href = undefined;
        break;
      case 'softbreak':
        push(' ');
        break;
      case 'hardbreak':
        push('\n');
        break;
      /* Images carry no bytes we can resolve here — an agent-authored
       * document references remote or sandbox paths a renderer cannot fetch.
       * The alt text is the part that still means something. */
      case 'image':
        push(token.content);
        break;
      default:
        break;
    }
  }
  return inlines;
}

/** Merges runs whose marks are identical, so `**bold** text` does not reach a
 *  renderer as a dozen single-character runs. */
function coalesce(inlines: DocInline[]): DocInline[] {
  const merged: DocInline[] = [];
  for (const run of inlines) {
    const previous = merged[merged.length - 1];
    if (
      previous != null &&
      previous.bold === run.bold &&
      previous.italic === run.italic &&
      previous.strike === run.strike &&
      previous.code === run.code &&
      previous.href === run.href
    ) {
      previous.text += run.text;
      continue;
    }
    merged.push({ ...run });
  }
  return merged;
}

/**
 * Converts markdown into the renderer-agnostic block model.
 *
 * The walk is a flat pass over markdown-it's token stream rather than a
 * recursive descent: the stream is already linear and every construct this
 * module supports is expressible as "which container is currently open",
 * which the frames below track. List nesting is flattened to a depth on each
 * entry because neither renderer wants the tree — docx numbering and pdf
 * indentation both read a level.
 */
export function parseMarkdownDocument(markdown: string): DocBlock[] {
  const tokens = parser.parse(markdown, {});
  const blocks: DocBlock[] = [];
  const listFrames: ListFrame[] = [];

  let listItems: DocListItem[] | null = null;
  let startsListItem = false;
  let quoteDepth = 0;
  let heading: DocHeadingLevel | null = null;
  let tableRows: DocTableRow[] | null = null;
  let tableRow: DocTableRow | null = null;
  let inTableHead = false;
  let expectCell = false;

  const flushList = (): void => {
    if (listItems != null && listItems.length > 0) {
      blocks.push({ type: 'list', items: listItems });
    }
    listItems = null;
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'heading_open':
        heading = headingLevels[token.tag] ?? 1;
        break;
      case 'heading_close':
        heading = null;
        break;

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = token.type === 'ordered_list_open';
        const start = Number(token.attrGet('start') ?? 1);
        listFrames.push({
          ordered,
          counter: Number.isFinite(start) ? start - 1 : 0,
        });
        listItems ??= [];
        break;
      }
      case 'bullet_list_close':
      case 'ordered_list_close':
        listFrames.pop();
        if (listFrames.length === 0) {
          flushList();
        }
        break;
      case 'list_item_open': {
        const frame = listFrames[listFrames.length - 1];
        if (frame != null) {
          frame.counter += 1;
        }
        startsListItem = true;
        break;
      }

      case 'blockquote_open':
        quoteDepth += 1;
        break;
      case 'blockquote_close':
        quoteDepth -= 1;
        break;

      case 'fence':
      case 'code_block':
        blocks.push({
          type: 'code',
          language: token.info.trim() === '' ? null : token.info.trim().split(/\s+/)[0],
          lines: token.content.replace(/\n$/, '').split('\n'),
        });
        break;

      case 'hr':
        blocks.push({ type: 'rule' });
        break;

      case 'table_open':
        tableRows = [];
        break;
      case 'table_close':
        if (tableRows != null && tableRows.length > 0) {
          blocks.push({ type: 'table', rows: tableRows });
        }
        tableRows = null;
        break;
      case 'thead_open':
        inTableHead = true;
        break;
      case 'thead_close':
        inTableHead = false;
        break;
      case 'tr_open':
        tableRow = { header: inTableHead, cells: [] };
        break;
      case 'tr_close':
        if (tableRow != null && tableRows != null) {
          tableRows.push(tableRow);
        }
        tableRow = null;
        break;
      case 'th_open':
      case 'td_open':
        expectCell = true;
        break;
      /* An empty cell produces no `inline` token, so the cell has to be
       * closed out here or the row silently loses a column and every later
       * cell shifts left. */
      case 'th_close':
      case 'td_close':
        if (expectCell && tableRow != null) {
          tableRow.cells.push([]);
        }
        expectCell = false;
        break;

      case 'inline': {
        const inlines = coalesce(toInlines(token.children));
        if (expectCell && tableRow != null) {
          tableRow.cells.push(inlines);
          expectCell = false;
          break;
        }
        if (inlines.length === 0) {
          startsListItem = false;
          break;
        }
        if (heading != null) {
          blocks.push({ type: 'heading', level: heading, inlines });
          break;
        }
        if (listFrames.length > 0 && listItems != null) {
          const frame = listFrames[listFrames.length - 1];
          const previous = listItems[listItems.length - 1];
          /* A second paragraph inside one list entry continues that entry —
           * emitting it as its own item would print a bullet the source
           * never had, and renumber everything after it. */
          if (!startsListItem && previous != null) {
            previous.inlines.push({ text: '\n' }, ...inlines);
            break;
          }
          listItems.push({
            level: listFrames.length - 1,
            ordered: frame?.ordered === true,
            index: frame?.counter ?? 1,
            inlines,
          });
          startsListItem = false;
          break;
        }
        blocks.push({ type: quoteDepth > 0 ? 'quote' : 'paragraph', inlines });
        break;
      }

      default:
        break;
    }
  }

  flushList();
  return blocks;
}

/** Plain-text reduction of a block model, used for the model-facing summary
 *  and for tests that assert content without asserting layout. */
export function documentToPlainText(blocks: readonly DocBlock[]): string {
  const lines: string[] = [];
  const flatten = (inlines: readonly DocInline[]): string =>
    inlines.map((run) => run.text).join('');

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'quote':
        lines.push(flatten(block.inlines));
        break;
      case 'list':
        for (const item of block.items) {
          const marker = item.ordered ? `${item.index}.` : '-';
          lines.push(`${'  '.repeat(item.level)}${marker} ${flatten(item.inlines)}`);
        }
        break;
      case 'table':
        for (const row of block.rows) {
          lines.push(row.cells.map((cell) => flatten(cell)).join(' | '));
        }
        break;
      case 'code':
        lines.push(...block.lines);
        break;
      case 'rule':
        lines.push('---');
        break;
    }
  }
  return lines.join('\n');
}
