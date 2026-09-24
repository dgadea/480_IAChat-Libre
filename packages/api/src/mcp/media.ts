import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import type { AxiosRequestConfig } from 'axios';
import type { MCPMediaKind, MCPMediaLink } from './types';
import type * as t from './types';
import { applySSRFSafeAgentIfDirect } from '~/auth';

export interface MCPMediaCaptureOptions {
  maxPerCall: number;
  /** URLs already stored during this response, so a result repeated by a later call is skipped. */
  captured: Set<string>;
}

export interface MCPMediaDownloadOptions {
  maxBytes: number;
  timeoutMs: number;
  allowedAddresses?: string[] | null;
  signal?: AbortSignal;
}

export interface MCPMediaDownload {
  buffer: Buffer;
  type: string;
  filename: string;
}

/** The `mcpSettings.mediaCapture` block of the app config. */
export interface MCPMediaCaptureSettings {
  enabled: boolean;
  maxBytes: number;
  timeoutMs: number;
  maxPerCall: number;
}

export interface CaptureMCPMediaParams<T> {
  settings?: MCPMediaCaptureSettings;
  captured: Set<string>;
  allowedAddresses?: string[] | null;
  signal?: AbortSignal;
  /** Persists one download and returns the stored record, emitting it to the client. */
  store: (download: MCPMediaDownload, link: MCPMediaLink) => Promise<T>;
}

const MEDIA_TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

const OPAQUE_TYPES = new Set(['application/octet-stream', 'binary/octet-stream']);
const URL_PATTERN = /https?:\/\/[^\s"'<>()[\]{}\\`|^]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?*_~]+$/;

function kindOfType(type: string | undefined | null): MCPMediaKind | undefined {
  const normalized = type?.toLowerCase() ?? '';
  if (normalized.startsWith('video/')) {
    return 'video';
  }
  if (normalized.startsWith('image/') && normalized !== 'image/svg+xml') {
    return 'image';
  }
  return undefined;
}

function parseHttpUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function typeFromExtension(url: URL): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(url.pathname);
  return match ? MEDIA_TYPES_BY_EXTENSION[match[1].toLowerCase()] : undefined;
}

function toMediaLink(raw: string, declaredType?: string): MCPMediaLink | undefined {
  const url = parseHttpUrl(raw.replace(TRAILING_PUNCTUATION, ''));
  if (!url) {
    return undefined;
  }
  const kind = kindOfType(declaredType) ?? kindOfType(typeFromExtension(url));
  return kind ? { url: url.href, kind } : undefined;
}

function linksInText(text: string): MCPMediaLink[] {
  return (text.match(URL_PATTERN) ?? []).flatMap((raw) => toMediaLink(raw) ?? []);
}

function linksInPart(part: t.ToolContentPart): MCPMediaLink[] {
  if (part.type === 'text') {
    return linksInText(part.text);
  }
  if (part.type === 'resource_link') {
    return [toMediaLink(part.uri, part.mimeType)].flatMap((link) => link ?? []);
  }
  if (part.type !== 'resource' || part.resource.uri.startsWith('ui://')) {
    return [];
  }
  const { resource } = part;
  return 'text' in resource && typeof resource.text === 'string' ? linksInText(resource.text) : [];
}

/**
 * Finds the images and videos an MCP result points to by URL — links in its text, resource
 * links, and the text of embedded resources. Media embedded as base64 is not included: that already
 * travels as an image artifact.
 */
export function collectMediaLinks(content: t.ToolContentPart[] | undefined): MCPMediaLink[] {
  const seen = new Set<string>();
  const links: MCPMediaLink[] = [];
  for (const part of content ?? []) {
    for (const link of linksInPart(part)) {
      if (seen.has(link.url)) {
        continue;
      }
      seen.add(link.url);
      links.push(link);
    }
  }
  return links;
}

/**
 * Picks the links worth storing from one tool call. When a result carries a video, its images
 * are taken to be thumbnails or posters of that video and are left out, and anything already
 * stored earlier in the response is skipped so a status call and a display call for the same
 * job produce one attachment.
 */
export function planMediaCapture(
  links: MCPMediaLink[] | undefined,
  { maxPerCall, captured }: MCPMediaCaptureOptions,
): MCPMediaLink[] {
  const candidates = links ?? [];
  const hasVideo = candidates.some((link) => link.kind === 'video');
  const planned = candidates
    .filter((link) => (!hasVideo || link.kind === 'video') && !captured.has(link.url))
    .slice(0, maxPerCall);
  for (const link of planned) {
    captured.add(link.url);
  }
  return planned;
}

/** Trusts the server's media type, and the URL's extension only when the server sent none. */
function resolveDownloadType(headerType: string, url: URL): string | undefined {
  if (kindOfType(headerType)) {
    return headerType;
  }
  return !headerType || OPAQUE_TYPES.has(headerType) ? typeFromExtension(url) : undefined;
}

function filenameOf(url: URL, type: string): string {
  const base = (url.pathname.split('/').pop() ?? '').replace(/[^\w.-]/g, '_');
  if (base && typeFromExtension(url)) {
    return base;
  }
  const extension = Object.keys(MEDIA_TYPES_BY_EXTENSION).find(
    (key) => MEDIA_TYPES_BY_EXTENSION[key] === type,
  );
  return `${base || 'media'}${extension ? `.${extension}` : ''}`;
}

/**
 * Downloads one linked image or video through the SSRF-guarded agents, refusing redirects,
 * private addresses, bodies over `maxBytes`, and responses that are not the media they claimed.
 */
export async function downloadMCPMedia(
  link: MCPMediaLink,
  { maxBytes, timeoutMs, allowedAddresses, signal }: MCPMediaDownloadOptions,
): Promise<MCPMediaDownload> {
  const url = new URL(link.url);
  const config: AxiosRequestConfig = {
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    signal,
  };
  applySSRFSafeAgentIfDirect(config, link.url, allowedAddresses);

  const response = await axios.get<ArrayBuffer>(link.url, config);
  const headerType = String(response.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const type = resolveDownloadType(headerType, url);
  if (!type || kindOfType(type) !== link.kind) {
    throw new Error(`MCP media at ${url.host} returned ${headerType || 'no content type'}`);
  }

  return { buffer: Buffer.from(response.data), type, filename: filenameOf(url, type) };
}

/**
 * Stores the media a tool call linked to, one promise per planned link. A failed download is
 * logged and resolves to `null`: the link stays in the model's text, so the turn never depends
 * on the copy succeeding.
 */
export function captureMCPMedia<T>(
  links: MCPMediaLink[] | undefined,
  { settings, captured, allowedAddresses, signal, store }: CaptureMCPMediaParams<T>,
): Promise<T | null>[] {
  if (!settings?.enabled) {
    return [];
  }
  const planned = planMediaCapture(links, { maxPerCall: settings.maxPerCall, captured });
  return planned.map(async (link) => {
    try {
      const download = await downloadMCPMedia(link, {
        maxBytes: settings.maxBytes,
        timeoutMs: settings.timeoutMs,
        allowedAddresses,
        signal,
      });
      return await store(download, link);
    } catch (error) {
      captured.delete(link.url);
      logger.warn(`[MCP media] Could not store ${new URL(link.url).host} ${link.kind}:`, error);
      return null;
    }
  });
}
