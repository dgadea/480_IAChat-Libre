import { FileContext, FileSources } from 'librechat-data-provider';
import type { StoredDocument } from './persist';
import type { ServerRequest } from '~/types';
import { extractCodeArtifactText, getExtractedTextFormat } from '~/files/code/extract';
import { classifyCodeArtifact } from '~/files/code/classify';
import { getStorageMetadata } from '~/storage/metadata';
import { persistGeneratedDocument } from './persist';
import { generateDocument } from './tool';
import { renderDocument } from './render';

const logger = { warn: jest.fn(), debug: jest.fn() };

/**
 * Substitutes only the two boundaries a unit test cannot own — the object
 * store and the file collection — and runs the real classifier, the real
 * mammoth-backed extractor and the real renderers against them. The preview
 * pipeline is the part most likely to break, so stubbing it would test
 * nothing worth testing.
 */
function createDeps() {
  const saved: { fileName: string; buffer: Buffer }[] = [];
  const created: StoredDocument[] = [];
  return {
    saved,
    created,
    deps: {
      logger,
      classifyCodeArtifact,
      extractCodeArtifactText,
      getExtractedTextFormat,
      getStorageMetadata,
      getRetentionExpiry: async () => ({}),
      getStrategyFunctions: () => ({
        saveBuffer: async ({ fileName, buffer }: { fileName: string; buffer: Buffer }) => {
          saved.push({ fileName, buffer });
          return `/uploads/${fileName}`;
        },
      }),
      createFile: async (data: StoredDocument) => {
        created.push(data);
        return data;
      },
    },
  };
}

const req = {
  user: { id: 'user-1' },
  config: { fileStrategy: FileSources.local },
} as unknown as ServerRequest & Required<Pick<ServerRequest, 'user' | 'config'>>;

describe('persistGeneratedDocument', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores a docx and renders its inline preview as sanitized HTML', async () => {
    const { deps, saved, created } = createDeps();
    const document = await renderDocument({
      markdown: '# Informe\n\nUn **párrafo**.',
      format: 'docx',
      meta: { title: 'Informe' },
    });

    const stored = await persistGeneratedDocument(
      { req, document, conversationId: 'conv-1' },
      deps,
    );

    expect(saved).toHaveLength(1);
    expect(saved[0].fileName).toBe(`${stored.file_id}__Informe.docx`);
    expect(stored.filename).toBe('Informe.docx');
    expect(stored.filepath).toBe(`/uploads/${stored.file_id}__Informe.docx`);
    expect(stored.context).toBe(FileContext.document_generation);
    expect(stored.conversationId).toBe('conv-1');
    expect(stored.bytes).toBe(document.buffer.length);
    expect(stored.user).toBe('user-1');

    expect(stored.textFormat).toBe('html');
    expect(stored.text).toContain('Informe');
    expect(stored.text).toContain('<strong>párrafo</strong>');

    expect(created).toEqual([stored]);
  });

  it('stores a pdf with no inline preview rather than failing', async () => {
    const { deps, created } = createDeps();
    const document = await renderDocument({
      markdown: '# Informe\n\nTexto.',
      format: 'pdf',
      meta: { title: 'Informe' },
    });

    const stored = await persistGeneratedDocument({ req, document, conversationId: null }, deps);

    expect(stored.filename).toBe('Informe.pdf');
    expect(stored.type).toBe('application/pdf');
    expect(stored.text).toBeNull();
    expect(created).toHaveLength(1);
  });

  it('refuses a storage strategy that cannot take a buffer', async () => {
    const { deps } = createDeps();
    const document = await renderDocument({
      markdown: '# x',
      format: 'docx',
      meta: { title: 'x' },
    });

    await expect(
      persistGeneratedDocument(
        { req, document },
        { ...deps, getStrategyFunctions: () => ({ saveBuffer: undefined }) },
      ),
    ).rejects.toThrow('cannot store a generated document');
  });
});

describe('generateDocument', () => {
  const persistWith = (deps: ReturnType<typeof createDeps>['deps']) => ({
    req,
    logger,
    persist: (document: Awaited<ReturnType<typeof renderDocument>>) =>
      persistGeneratedDocument({ req, document }, deps),
  });

  it('renders, stores and summarizes a document', async () => {
    const { deps, created } = createDeps();
    const result = await generateDocument(
      { title: 'Propuesta', content: '# Propuesta\n\nContenido.', format: 'docx' },
      persistWith(deps),
    );

    expect(result.document).not.toBeNull();
    expect(result.document?.filename).toBe('Propuesta.docx');
    expect(result.text).toContain('Created Propuesta.docx (DOCX');
    expect(result.text).toContain('do not repeat its full text');
    expect(created).toHaveLength(1);
  });

  it('passes a renderer warning back to the model', async () => {
    const { deps } = createDeps();
    const result = await generateDocument(
      { title: 'Resumen', content: '# 总结\n\nTexto.', format: 'pdf' },
      persistWith(deps),
    );

    expect(result.document).not.toBeNull();
    expect(result.text).toContain('character(s) outside the PDF built-in font range');
  });

  it.each([
    [{ title: '', content: '# x', format: 'docx' }, 'Missing required field: title'],
    [{ title: 'x', content: '   ', format: 'docx' }, 'Missing required field: content'],
    [{ title: 'x', content: '# x', format: 'rtf' }, 'Unsupported format "rtf"'],
    [{ title: 'x', content: '# x' }, 'Unsupported format "undefined"'],
  ])('refuses %j without storing anything', async (input, message) => {
    const { deps, created } = createDeps();
    const result = await generateDocument(input, persistWith(deps));

    expect(result.document).toBeNull();
    expect(result.text).toContain(message);
    expect(created).toHaveLength(0);
  });

  it('refuses a format the deployment disabled', async () => {
    const { deps, created } = createDeps();
    const result = await generateDocument(
      { title: 'x', content: '# x', format: 'pdf' },
      { ...persistWith(deps), config: { formats: ['docx'] } },
    );

    expect(result.document).toBeNull();
    expect(result.text).toContain('The pdf format is disabled');
    expect(created).toHaveLength(0);
  });

  it('refuses content over the configured ceiling', async () => {
    const { deps, created } = createDeps();
    const result = await generateDocument(
      { title: 'x', content: 'a'.repeat(101), format: 'docx' },
      { ...persistWith(deps), config: { maxInputLength: 100 } },
    );

    expect(result.document).toBeNull();
    expect(result.text).toContain('over the 100 limit');
    expect(created).toHaveLength(0);
  });
});
