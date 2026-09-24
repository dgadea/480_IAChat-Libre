import { Constants } from 'librechat-data-provider';
import type { MCPAttachedImage } from '../attachments';
import { buildMCPImageLinkContext } from '../attachments';

const MCP_TOOL = `generate_video${Constants.mcp_delimiter}higgsfield`;
const images: MCPAttachedImage[] = [
  { file_id: 'file-1', filename: 'jeep.png' },
  { file_id: 'file-2', filename: 'sunset.jpg' },
];
const signedURL = async (file: MCPAttachedImage) =>
  `https://r2.example.com/images/${file.file_id}?X-Amz-Signature=abc`;

describe('buildMCPImageLinkContext', () => {
  it('lists each attached image with its URL, in order', async () => {
    const context = await buildMCPImageLinkContext({
      settings: { enabled: true },
      toolNames: ['web_search', MCP_TOOL],
      imageFiles: images,
      resolveURL: signedURL,
    });

    expect(context).toContain(
      '\t- jeep.png: https://r2.example.com/images/file-1?X-Amz-Signature=abc\n' +
        '\t- sunset.jpg: https://r2.example.com/images/file-2?X-Amz-Signature=abc',
    );
    expect(context).toContain('image_url');
  });

  it.each([
    ['disabled', { enabled: false }, [MCP_TOOL]],
    ['unset', undefined, [MCP_TOOL]],
    ['without MCP tools', { enabled: true }, ['web_search', 'gemini_video_gen']],
  ])('returns nothing when %s', async (_label, settings, toolNames) => {
    const resolveURL = jest.fn(signedURL);
    const context = await buildMCPImageLinkContext({
      settings,
      toolNames,
      imageFiles: images,
      resolveURL,
    });

    expect(context).toBe('');
    expect(resolveURL).not.toHaveBeenCalled();
  });

  it('returns nothing when no image was attached', async () => {
    const context = await buildMCPImageLinkContext({
      settings: { enabled: true },
      toolNames: [MCP_TOOL],
      imageFiles: [],
      resolveURL: signedURL,
    });

    expect(context).toBe('');
  });

  it('skips images whose storage cannot produce a URL or fails to', async () => {
    const context = await buildMCPImageLinkContext({
      settings: { enabled: true },
      toolNames: [MCP_TOOL],
      imageFiles: [...images, { file_id: 'file-3' }],
      resolveURL: async (file) => {
        if (file.file_id === 'file-1') {
          return undefined;
        }
        if (file.file_id === 'file-2') {
          throw new Error('S3 not initialized');
        }
        return signedURL(file);
      },
    });

    expect(context).not.toContain('jeep.png');
    expect(context).not.toContain('sunset.jpg');
    expect(context).toContain('\t- file-3: https://r2.example.com/images/file-3');
  });

  it('returns nothing when no image resolves to a URL', async () => {
    const context = await buildMCPImageLinkContext({
      settings: { enabled: true },
      toolNames: [MCP_TOOL],
      imageFiles: images,
      resolveURL: async () => null,
    });

    expect(context).toBe('');
  });
});
