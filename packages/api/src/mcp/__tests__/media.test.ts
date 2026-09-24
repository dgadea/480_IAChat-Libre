import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MCPMediaCaptureSettings, MCPMediaDownload } from '../media';
import type * as t from '../types';
import { collectMediaLinks, planMediaCapture, captureMCPMedia, downloadMCPMedia } from '../media';
import { formatToolContent } from '../parsers';

const VIDEO_URL = 'https://cdn.example.com/user_1/hf_20260924_clip.mp4';
const POSTER_URL = 'https://cdn.example.com/user_1/hf_20260924_clip.webp';

describe('collectMediaLinks', () => {
  it('finds media URLs in text, trimming markdown and sentence punctuation', () => {
    const content: t.ToolContentPart[] = [
      { type: 'text', text: `Done! [Ver video](${VIDEO_URL}). Poster: ${POSTER_URL},` },
    ];

    expect(collectMediaLinks(content)).toEqual([
      { url: VIDEO_URL, kind: 'video' },
      { url: POSTER_URL, kind: 'image' },
    ]);
  });

  it('classifies a resource link by its declared type before its extension', () => {
    const content: t.ToolContentPart[] = [
      {
        type: 'resource_link',
        uri: 'https://cdn.example.com/jobs/42',
        name: 'job',
        mimeType: 'video/mp4',
      },
    ];

    expect(collectMediaLinks(content)).toEqual([
      { url: 'https://cdn.example.com/jobs/42', kind: 'video' },
    ]);
  });

  it('reads links inside embedded resource text and skips UI resources', () => {
    const content: t.ToolContentPart[] = [
      {
        type: 'resource',
        resource: { uri: 'job://42', mimeType: 'application/json', text: `{"url":"${VIDEO_URL}"}` },
      },
      {
        type: 'resource',
        resource: {
          uri: 'ui://player',
          mimeType: 'text/html',
          text: `<video src="${POSTER_URL}">`,
        },
      },
    ];

    expect(collectMediaLinks(content)).toEqual([{ url: VIDEO_URL, kind: 'video' }]);
  });

  it('ignores pages, SVGs, non-http schemes and repeats', () => {
    const content: t.ToolContentPart[] = [
      {
        type: 'text',
        text: `https://higgsfield.ai/jobs/42 https://cdn.example.com/logo.svg ftp://x.com/a.mp4 ${VIDEO_URL}`,
      },
      { type: 'text', text: VIDEO_URL },
    ];

    expect(collectMediaLinks(content)).toEqual([{ url: VIDEO_URL, kind: 'video' }]);
  });
});

describe('planMediaCapture', () => {
  it('drops the images that accompany a video as its thumbnails', () => {
    const planned = planMediaCapture(
      [
        { url: POSTER_URL, kind: 'image' },
        { url: VIDEO_URL, kind: 'video' },
      ],
      { maxPerCall: 4, captured: new Set() },
    );

    expect(planned).toEqual([{ url: VIDEO_URL, kind: 'video' }]);
  });

  it('stores a link once per response and respects the per-call limit', () => {
    const captured = new Set<string>();
    const images = ['a', 'b', 'c'].map((name) => ({
      url: `https://cdn.example.com/${name}.png`,
      kind: 'image' as const,
    }));

    expect(planMediaCapture(images, { maxPerCall: 2, captured })).toEqual(images.slice(0, 2));
    expect(planMediaCapture(images, { maxPerCall: 2, captured })).toEqual(images.slice(2));
    expect(planMediaCapture(images, { maxPerCall: 2, captured })).toEqual([]);
  });
});

describe('formatToolContent media artifact', () => {
  const result: t.MCPToolCallResponse = {
    content: [{ type: 'text', text: `Job completed: ${VIDEO_URL}` }],
  };

  it('attaches linked media beside the text for a recognized provider', () => {
    const [content, artifacts] = formatToolContent(result, 'google');

    expect(content).toBe(`Job completed: ${VIDEO_URL}`);
    expect(artifacts).toEqual({ media: [{ url: VIDEO_URL, kind: 'video' }] });
    expect(artifacts?.content).toBeUndefined();
  });

  it('attaches linked media for an unrecognized provider too', () => {
    const [, artifacts] = formatToolContent(result, 'custom' as t.Provider);

    expect(artifacts).toEqual({ media: [{ url: VIDEO_URL, kind: 'video' }] });
  });
});

describe('downloadMCPMedia', () => {
  const VIDEO_BYTES = Buffer.from('fake mp4 bytes');
  let server: http.Server;
  let origin: string;
  let allowedAddresses: string[];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/clip.mp4') {
        res.writeHead(200, { 'Content-Type': 'video/mp4' });
        res.end(VIDEO_BYTES);
        return;
      }
      if (req.url === '/opaque.mp4') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(VIDEO_BYTES);
        return;
      }
      if (req.url === '/moved.mp4') {
        res.writeHead(302, { Location: '/clip.mp4' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>login</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
    allowedAddresses = [`127.0.0.1:${port}`];
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const options = () => ({ maxBytes: 1024, timeoutMs: 5_000, allowedAddresses });

  it('returns the bytes, type and filename of the linked media', async () => {
    const download = await downloadMCPMedia(
      { url: `${origin}/clip.mp4`, kind: 'video' },
      options(),
    );

    expect(download).toEqual({ buffer: VIDEO_BYTES, type: 'video/mp4', filename: 'clip.mp4' });
  });

  it('falls back to the extension when the server sends an opaque type', async () => {
    const download = await downloadMCPMedia(
      { url: `${origin}/opaque.mp4`, kind: 'video' },
      options(),
    );

    expect(download.type).toBe('video/mp4');
  });

  it('refuses a page served under a media URL', async () => {
    await expect(
      downloadMCPMedia({ url: `${origin}/page.mp4`, kind: 'video' }, options()),
    ).rejects.toThrow('text/html');
  });

  it('refuses a body larger than maxBytes', async () => {
    await expect(
      downloadMCPMedia({ url: `${origin}/clip.mp4`, kind: 'video' }, { ...options(), maxBytes: 4 }),
    ).rejects.toThrow();
  });

  it('refuses to follow redirects', async () => {
    await expect(
      downloadMCPMedia({ url: `${origin}/moved.mp4`, kind: 'video' }, options()),
    ).rejects.toThrow();
  });

  it('refuses a private address that is not explicitly allowed', async () => {
    await expect(
      downloadMCPMedia(
        { url: `${origin}/clip.mp4`, kind: 'video' },
        { maxBytes: 1024, timeoutMs: 5_000 },
      ),
    ).rejects.toThrow();
  });

  describe('captureMCPMedia', () => {
    const settings: MCPMediaCaptureSettings = {
      enabled: true,
      maxBytes: 1024,
      timeoutMs: 5_000,
      maxPerCall: 4,
    };

    it('does nothing while disabled', () => {
      const store = jest.fn();
      const promises = captureMCPMedia([{ url: `${origin}/clip.mp4`, kind: 'video' }], {
        settings: { ...settings, enabled: false },
        captured: new Set(),
        allowedAddresses,
        store,
      });

      expect(promises).toEqual([]);
      expect(store).not.toHaveBeenCalled();
    });

    it('stores each planned download', async () => {
      const stored: MCPMediaDownload[] = [];
      const results = await Promise.all(
        captureMCPMedia([{ url: `${origin}/clip.mp4`, kind: 'video' }], {
          settings,
          captured: new Set(),
          allowedAddresses,
          store: async (download) => {
            stored.push(download);
            return download.filename;
          },
        }),
      );

      expect(results).toEqual(['clip.mp4']);
      expect(stored[0].buffer).toEqual(VIDEO_BYTES);
    });

    it('resolves a failed download to null and releases the link for a retry', async () => {
      const captured = new Set<string>();
      const link = { url: `${origin}/page.mp4`, kind: 'video' as const };
      const results = await Promise.all(
        captureMCPMedia([link], { settings, captured, allowedAddresses, store: jest.fn() }),
      );

      expect(results).toEqual([null]);
      expect(captured.has(link.url)).toBe(false);
    });
  });
});
