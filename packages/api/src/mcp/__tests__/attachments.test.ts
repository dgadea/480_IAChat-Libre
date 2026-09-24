import { Constants } from 'librechat-data-provider';
import type { MCPAttachedImage, MCPImageLinkSettings } from '../attachments';
import { buildMCPImageLinkContext, imageRef } from '../attachments';

const MCP_TOOL = `generate_video${Constants.mcp_delimiter}higgsfield`;
const enabled: MCPImageLinkSettings = { enabled: true, maxImages: 4 };
const jeep: MCPAttachedImage = { file_id: 'a1b2c3d4-jeep', filename: 'jeep.png' };
const sunset: MCPAttachedImage = { file_id: 'e5f6a7b8-sunset', filename: 'sunset.jpg' };
const canyon: MCPAttachedImage = { file_id: 'c9d0e1f2-canyon', filename: 'canyon.webp' };
const signedURL = async (file: MCPAttachedImage) =>
  `https://r2.example.com/images/${file.file_id}?X-Amz-Signature=abc`;

describe('imageRef', () => {
  it('is short, stable and derived from the file id', () => {
    expect(imageRef(jeep)).toBe('img-a1b2c3');
    expect(imageRef({ file_id: 'A1-B2-C3-D4' })).toBe('img-a1b2c3');
  });
});

describe('buildMCPImageLinkContext', () => {
  it('lists the current message images first, then earlier ones, with refs and URLs', async () => {
    const context = await buildMCPImageLinkContext({
      settings: enabled,
      toolNames: ['web_search', MCP_TOOL],
      imageFiles: [jeep],
      loadEarlierImages: async () => [jeep, sunset],
      resolveURL: signedURL,
    });

    expect(context).toContain(
      `\t- [img-a1b2c3] jeep.png (attached to the current message): https://r2.example.com/images/${jeep.file_id}?X-Amz-Signature=abc\n` +
        `\t- [img-e5f6a7] sunset.jpg: https://r2.example.com/images/${sunset.file_id}?X-Amz-Signature=abc\n`,
    );
    expect(context).toContain('most recent one');
  });

  it('lists earlier images when the current message has none, so a confirm turn still works', async () => {
    const context = await buildMCPImageLinkContext({
      settings: enabled,
      toolNames: [MCP_TOOL],
      loadEarlierImages: async () => [sunset],
      resolveURL: signedURL,
    });

    expect(context).toContain('\t- [img-e5f6a7] sunset.jpg: https://');
    expect(context).not.toContain('current message)');
  });

  it('keeps no more than maxImages, the current message first', async () => {
    const loadEarlierImages = jest.fn(async () => [sunset, canyon]);
    const context = await buildMCPImageLinkContext({
      settings: { enabled: true, maxImages: 2 },
      toolNames: [MCP_TOOL],
      imageFiles: [jeep],
      loadEarlierImages,
      resolveURL: signedURL,
    });

    expect(loadEarlierImages).toHaveBeenCalledWith(2);
    expect(context).toContain('jeep.png');
    expect(context).toContain('sunset.jpg');
    expect(context).not.toContain('canyon.webp');
  });

  it.each([
    ['disabled', { enabled: false, maxImages: 4 }, [MCP_TOOL]],
    ['unset', undefined, [MCP_TOOL]],
    ['without MCP tools', enabled, ['web_search', 'gemini_video_gen']],
  ])('reads and signs nothing when %s', async (_label, settings, toolNames) => {
    const resolveURL = jest.fn(signedURL);
    const loadEarlierImages = jest.fn(async () => [sunset]);
    const context = await buildMCPImageLinkContext({
      settings,
      toolNames,
      imageFiles: [jeep],
      loadEarlierImages,
      resolveURL,
    });

    expect(context).toBe('');
    expect(loadEarlierImages).not.toHaveBeenCalled();
    expect(resolveURL).not.toHaveBeenCalled();
  });

  it('keeps the current images when the earlier ones cannot be read', async () => {
    const context = await buildMCPImageLinkContext({
      settings: enabled,
      toolNames: [MCP_TOOL],
      imageFiles: [jeep],
      loadEarlierImages: async () => {
        throw new Error('database unavailable');
      },
      resolveURL: signedURL,
    });

    expect(context).toContain('jeep.png');
  });

  it('skips images whose storage cannot produce a URL or fails to', async () => {
    const context = await buildMCPImageLinkContext({
      settings: enabled,
      toolNames: [MCP_TOOL],
      imageFiles: [jeep, sunset, canyon],
      resolveURL: async (file) => {
        if (file === jeep) {
          return undefined;
        }
        if (file === sunset) {
          throw new Error('S3 not initialized');
        }
        return signedURL(file);
      },
    });

    expect(context).not.toContain('jeep.png');
    expect(context).not.toContain('sunset.jpg');
    expect(context).toContain('canyon.webp');
  });

  it('returns nothing when there is no image or none resolves to a URL', async () => {
    await expect(
      buildMCPImageLinkContext({
        settings: enabled,
        toolNames: [MCP_TOOL],
        loadEarlierImages: async () => [],
        resolveURL: signedURL,
      }),
    ).resolves.toBe('');
    await expect(
      buildMCPImageLinkContext({
        settings: enabled,
        toolNames: [MCP_TOOL],
        imageFiles: [jeep],
        resolveURL: async () => null,
      }),
    ).resolves.toBe('');
  });
});
