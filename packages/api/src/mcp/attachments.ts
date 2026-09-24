import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';

export interface MCPAttachedImage {
  file_id: string;
  filename?: string;
}

export interface BuildMCPImageLinkContextParams<T extends MCPAttachedImage> {
  /** The `mcpSettings.imageLinks` block of the app config. */
  settings?: { enabled: boolean };
  /** The agent's tool names; nothing is listed unless one of them is an MCP tool. */
  toolNames?: Array<string | null | undefined>;
  imageFiles?: T[];
  /** Returns a URL the MCP server can fetch without the user's session, or nothing when the
   * file's storage cannot produce one (local disk, for instance). */
  resolveURL: (file: T) => Promise<string | null | undefined>;
}

/**
 * Lists the images attached to this request as fetchable URLs, for MCP tools that take an image
 * by URL (`image_url`, `end_image_url`). The model only receives an attached image as pixels, so
 * without this it has nothing to put in a URL argument. Returns an empty string while disabled,
 * for an agent without MCP tools, or when no image resolves to a URL.
 */
export async function buildMCPImageLinkContext<T extends MCPAttachedImage>({
  settings,
  toolNames,
  imageFiles,
  resolveURL,
}: BuildMCPImageLinkContextParams<T>): Promise<string> {
  const hasMCPTools = toolNames?.some((name) => name?.includes(Constants.mcp_delimiter));
  if (!settings?.enabled || !hasMCPTools || !imageFiles?.length) {
    return '';
  }

  const resolved = await Promise.all(
    imageFiles.map(async (file) => {
      try {
        return { file, url: await resolveURL(file) };
      } catch (error) {
        logger.warn(`[MCP image links] Could not resolve a URL for file ${file.file_id}:`, error);
        return { file, url: undefined };
      }
    }),
  );
  const lines = resolved.flatMap(({ file, url }) =>
    url ? [`\t- ${file.filename ?? file.file_id}: ${url}`] : [],
  );
  if (lines.length === 0) {
    return '';
  }

  return [
    'Images the user attached to this request, as public URLs, in order of appearance:',
    ...lines,
    '',
    'When an MCP tool needs an image by URL (for example `image_url`, or `end_image_url` for a last frame), pass these URLs directly. Do not ask the user to upload them again, and do not show the URLs to the user.',
  ].join('\n');
}
