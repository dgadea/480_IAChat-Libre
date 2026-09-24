import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';

export interface MCPAttachedImage {
  file_id: string;
  filename?: string;
}

/** The `mcpSettings.imageLinks` block of the app config. */
export interface MCPImageLinkSettings {
  enabled: boolean;
  maxImages: number;
}

export interface BuildMCPImageLinkContextParams<T extends MCPAttachedImage> {
  settings?: MCPImageLinkSettings;
  /** The agent's tool names; nothing is listed unless one of them is an MCP tool. */
  toolNames?: Array<string | null | undefined>;
  /** Images attached to the message being answered. */
  imageFiles?: T[];
  /** Images attached earlier in the conversation, newest first, read only when enabled. */
  loadEarlierImages?: (limit: number) => Promise<T[]>;
  /** Returns a URL the MCP server can fetch without the user's session, or nothing when the
   * file's storage cannot produce one (local disk, for instance). */
  resolveURL: (file: T) => Promise<string | null | undefined>;
}

/** A short reference that stays the same for a file across turns, unlike its position. */
export function imageRef(file: MCPAttachedImage): string {
  return `img-${file.file_id
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 6)
    .toLowerCase()}`;
}

async function readEarlierImages<T extends MCPAttachedImage>(
  load: BuildMCPImageLinkContextParams<T>['loadEarlierImages'],
  limit: number,
): Promise<T[]> {
  if (!load) {
    return [];
  }
  try {
    return await load(limit);
  } catch (error) {
    logger.warn('[MCP image links] Could not read earlier images of the conversation:', error);
    return [];
  }
}

async function resolveOrSkip<T extends MCPAttachedImage>(
  file: T,
  resolveURL: BuildMCPImageLinkContextParams<T>['resolveURL'],
): Promise<string | undefined> {
  try {
    return (await resolveURL(file)) ?? undefined;
  } catch (error) {
    logger.warn(`[MCP image links] Could not resolve a URL for file ${file.file_id}:`, error);
    return undefined;
  }
}

/**
 * Lists the images the user attached in this conversation as fetchable URLs, for MCP tools that
 * take an image by URL (`image_url`, `end_image_url`). The model only receives an attached image
 * as pixels, so without this it has nothing to put in a URL argument — and an agent that first
 * confirms or refines the prompt calls the tool a turn or two after the upload, so earlier images
 * are listed too, newest first. URLs are signed afresh on every request, so an old upload does
 * not hand the tool an expired link.
 *
 * Returns an empty string while disabled, for an agent without MCP tools, or when no image
 * resolves to a URL.
 */
export async function buildMCPImageLinkContext<T extends MCPAttachedImage>({
  settings,
  toolNames,
  imageFiles = [],
  loadEarlierImages,
  resolveURL,
}: BuildMCPImageLinkContextParams<T>): Promise<string> {
  const hasMCPTools = toolNames?.some((name) => name?.includes(Constants.mcp_delimiter));
  if (!settings?.enabled || !hasMCPTools) {
    return '';
  }

  const current = new Set(imageFiles.map((file) => file.file_id));
  const earlier = await readEarlierImages(loadEarlierImages, settings.maxImages);
  const candidates = [...imageFiles, ...earlier.filter((file) => !current.has(file.file_id))]
    .filter((file, index, all) => all.findIndex((f) => f.file_id === file.file_id) === index)
    .slice(0, settings.maxImages);
  if (candidates.length === 0) {
    return '';
  }

  const urls = await Promise.all(candidates.map((file) => resolveOrSkip(file, resolveURL)));
  const lines = candidates.flatMap((file, index) => {
    const url = urls[index];
    if (!url) {
      return [];
    }
    const note = current.has(file.file_id) ? ' (attached to the current message)' : '';
    return [`\t- [${imageRef(file)}] ${file.filename ?? 'image'}${note}: ${url}`];
  });
  if (lines.length === 0) {
    return '';
  }

  return [
    'Images the user attached in this conversation, as public URLs, most recent first:',
    ...lines,
    '',
    'When an MCP tool needs an image by URL (for example `image_url`, or `end_image_url` for a last frame), pass the matching URL directly — unless the user says otherwise, "the image" means the most recent one. The user may point to an image by its reference, file name, or order. When confirming a generation, name the image you will use by its reference and file name so the user can correct it. Do not ask the user to upload an image listed here again, and do not show the URLs to the user.',
  ].join('\n');
}
