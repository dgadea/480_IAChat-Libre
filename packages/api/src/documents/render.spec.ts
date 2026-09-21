import yauzl from 'yauzl';
import { parseMarkdownDocument, documentToPlainText } from './markdown';
import { renderDocument, toDocumentFilename } from './render';
import { sanitizeForStandardFonts } from './pdf';

/** Reads one entry out of a docx package so assertions run against the real
 *  OOXML the renderer produced rather than against its in-memory model. */
function readZipEntry(buffer: Buffer, entryName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipfile) => {
      if (openError != null || zipfile == null) {
        reject(openError ?? new Error('could not open package'));
        return;
      }
      zipfile.on('entry', (entry) => {
        if (entry.fileName !== entryName) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError != null || stream == null) {
            reject(streamError ?? new Error('could not read entry'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          stream.on('error', reject);
        });
      });
      zipfile.on('end', () => reject(new Error(`entry not found: ${entryName}`)));
      zipfile.readEntry();
    });
  });
}

describe('parseMarkdownDocument', () => {
  it('maps headings, emphasis and links onto formatted runs', () => {
    const blocks = parseMarkdownDocument(
      '# Informe\n\nTexto **fuerte**, *suave* y [un enlace](https://example.com).',
    );

    expect(blocks[0]).toEqual({
      type: 'heading',
      level: 1,
      inlines: [{ text: 'Informe' }],
    });
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      inlines: [
        { text: 'Texto ' },
        { text: 'fuerte', bold: true },
        { text: ', ' },
        { text: 'suave', italic: true },
        { text: ' y ' },
        { text: 'un enlace', href: 'https://example.com' },
        { text: '.' },
      ],
    });
  });

  it('flattens nested lists onto per-entry depth and marker', () => {
    const blocks = parseMarkdownDocument('1. uno\n2. dos\n   - anidado\n   - otro\n3. tres');

    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    if (list.type !== 'list') {
      throw new Error('expected a list block');
    }
    expect(
      list.items.map((item) => ({
        level: item.level,
        ordered: item.ordered,
        index: item.index,
        text: item.inlines.map((run) => run.text).join(''),
      })),
    ).toEqual([
      { level: 0, ordered: true, index: 1, text: 'uno' },
      { level: 0, ordered: true, index: 2, text: 'dos' },
      { level: 1, ordered: false, index: 1, text: 'anidado' },
      { level: 1, ordered: false, index: 2, text: 'otro' },
      { level: 0, ordered: true, index: 3, text: 'tres' },
    ]);
  });

  it('honors the start attribute of an ordered list', () => {
    const blocks = parseMarkdownDocument('5. cinco\n6. seis');
    const list = blocks[0];
    if (list.type !== 'list') {
      throw new Error('expected a list block');
    }
    expect(list.items.map((item) => item.index)).toEqual([5, 6]);
  });

  it('keeps a table rectangular when a row omits a trailing cell', () => {
    const blocks = parseMarkdownDocument(
      ['| A | B |', '| - | - |', '| 1 |  |', '| 2 | 3 |'].join('\n'),
    );

    const table = blocks[0];
    if (table.type !== 'table') {
      throw new Error('expected a table block');
    }
    expect(table.rows.map((row) => row.header)).toEqual([true, false, false]);
    expect(table.rows.map((row) => row.cells.length)).toEqual([2, 2, 2]);
    expect(table.rows[1].cells[1]).toEqual([]);
  });

  it('captures fenced code with its language and drops the trailing newline', () => {
    const blocks = parseMarkdownDocument('```ts\nconst a = 1;\nconst b = 2;\n```');

    expect(blocks[0]).toEqual({
      type: 'code',
      language: 'ts',
      lines: ['const a = 1;', 'const b = 2;'],
    });
  });

  it('routes blockquote paragraphs to quote blocks', () => {
    const blocks = parseMarkdownDocument('> citado\n\nnormal');
    expect(blocks.map((block) => block.type)).toEqual(['quote', 'paragraph']);
  });

  it('continues a list entry that carries a second paragraph', () => {
    const blocks = parseMarkdownDocument('- primero\n\n  continuación\n\n- segundo');
    const list = blocks[0];
    if (list.type !== 'list') {
      throw new Error('expected a list block');
    }
    expect(list.items).toHaveLength(2);
    expect(list.items[0].inlines.map((run) => run.text).join('')).toBe('primero\ncontinuación');
  });

  /* `html: false` makes markdown-it emit raw HTML as literal text instead of
   * markup. That is the safe outcome for a document: the tags reach Word and
   * the PDF as inert characters in a paragraph, and no block structure is ever
   * derived from attacker-authored markup. */
  it('degrades raw HTML to inert text instead of structure', () => {
    const blocks = parseMarkdownDocument('<script>alert(1)</script>\n\ntexto');

    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph']);
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      inlines: [{ text: '<script>alert(1)</script>' }],
    });
    expect(documentToPlainText(blocks)).toBe('<script>alert(1)</script>\ntexto');
  });
});

describe('toDocumentFilename', () => {
  it('strips path separators and control characters from a model-authored title', () => {
    expect(toDocumentFilename('../../etc/passwd', 'docx')).toBe('.. .. etc passwd.docx');
    expect(toDocumentFilename('Informe: Q4/2026', 'pdf')).toBe('Informe Q4 2026.pdf');
  });

  it('strips control characters a title should never carry into a storage key', () => {
    const title = 'Informe' + String.fromCharCode(0) + String.fromCharCode(31) + 'Q4';
    expect(toDocumentFilename(title, 'docx')).toBe('Informe Q4.docx');
    expect(toDocumentFilename(`a${String.fromCharCode(127)}b`, 'pdf')).toBe('a b.pdf');
  });

  it('falls back when the title reduces to nothing', () => {
    expect(toDocumentFilename('///', 'docx')).toBe('document.docx');
    expect(toDocumentFilename('   ', 'pdf')).toBe('document.pdf');
  });
});

describe('sanitizeForStandardFonts', () => {
  it('keeps Latin-1 text intact', () => {
    expect(sanitizeForStandardFonts('Año: ¿qué tal? —sí').dropped).toBe(0);
  });

  it('transliterates arrows instead of dropping them', () => {
    expect(sanitizeForStandardFonts('a → b').text).toBe('a -> b');
  });

  it('counts characters no built-in font can encode', () => {
    const result = sanitizeForStandardFonts('总结 report');
    expect(result.dropped).toBe(2);
    expect(result.text).toBe(' report');
  });
});

describe('renderDocument', () => {
  const markdown = [
    '# Informe trimestral',
    '',
    'Resumen con **negrita**, *cursiva* y `código`.',
    '',
    '## Detalle',
    '',
    '- punto uno',
    '- punto dos',
    '  1. anidado',
    '',
    '| Región | Ventas |',
    '| --- | --- |',
    '| Norte | 120 |',
    '| Sur | 80 |',
    '',
    '> Una cita.',
    '',
    '```js',
    'const total = 200;',
    '```',
    '',
    '---',
  ].join('\n');

  it('produces a docx package whose document part carries the content', async () => {
    const result = await renderDocument({
      markdown,
      format: 'docx',
      meta: { title: 'Informe trimestral', author: 'LibreChat' },
    });

    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.filename).toBe('Informe trimestral.docx');
    expect(result.warnings).toEqual([]);
    expect(result.buffer.subarray(0, 2).toString('latin1')).toBe('PK');

    const document = await readZipEntry(result.buffer, 'word/document.xml');
    expect(document).toContain('Informe trimestral');
    expect(document).toContain('negrita');
    expect(document).toContain('Región');
    expect(document).toContain('const total = 200;');
    expect(document).toContain('<w:tbl>');
  });

  it('produces a PDF and reports characters it could not encode', async () => {
    const latin = await renderDocument({
      markdown,
      format: 'pdf',
      meta: { title: 'Informe trimestral' },
    });

    expect(latin.mimeType).toBe('application/pdf');
    expect(latin.filename).toBe('Informe trimestral.pdf');
    expect(latin.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(latin.warnings).toEqual([]);

    const cjk = await renderDocument({
      markdown: '# 总结\n\nTexto.',
      format: 'pdf',
      meta: { title: 'Resumen' },
    });
    expect(cjk.warnings).toHaveLength(1);
    expect(cjk.warnings[0]).toContain('2 character(s)');
  });

  it('renders an empty document rather than failing on empty input', async () => {
    const result = await renderDocument({
      markdown: '',
      format: 'docx',
      meta: { title: 'Vacío' },
    });
    expect(result.buffer.byteLength).toBeGreaterThan(0);
  });

  it('rejects an unknown format', async () => {
    await expect(
      renderDocument({
        markdown: '# x',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        format: 'rtf' as any,
        meta: { title: 'x' },
      }),
    ).rejects.toThrow('Unsupported document format');
  });
});
