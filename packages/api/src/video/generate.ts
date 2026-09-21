import { logger } from '@librechat/data-schemas';
import { DEFAULT_VIDEO_MAX_FILE_SIZE_MB } from 'librechat-data-provider';
import type { TVideoGenerationConfig, AgentToolOptions } from 'librechat-data-provider';
import type { VideoAdapter, VideoAdapterCapabilities, VideoGenerationRequest } from './types';
import {
  createVideoAdapter,
  mergeCapabilities,
  resolveVideoConfig,
  resolveVideoSelection,
} from './registry';

const BYTES_PER_MB = 1024 * 1024;

/** The provider chosen for a conversation, resolved once so the tool can
 *  describe itself to the model from the capabilities it will actually use. */
export interface PreparedVideoGeneration {
  adapter: VideoAdapter;
  provider: string;
  model: string;
  /** The adapter's defaults with this model's overrides applied — what the tool
   *  describes to the model, so the two can never disagree. */
  capabilities: VideoAdapterCapabilities;
  maxBytes: number;
}

/** A finished video, always as bytes: whether the provider answered with a
 *  buffer or a location is settled here rather than by every caller. */
export interface VideoGenerationOutcome {
  buffer: Buffer;
  mimeType: string;
  previousId?: string;
}

/**
 * Resolves the provider, model and adapter for a conversation.
 *
 * Called when the tool is built rather than when it runs, because the argument
 * schema the model sees is derived from the adapter's capabilities — a provider
 * resolved at call time could only be described by a constant that contradicts
 * it. Returns null when no provider is configured and no fallback credential
 * exists, which the tool reports as a missing key rather than as a failure.
 */
export function prepareVideoGeneration({
  config,
  toolOptions,
  toolId,
  fallback,
}: {
  config?: TVideoGenerationConfig | null;
  toolOptions?: AgentToolOptions | null;
  toolId: string;
  fallback?: { apiKey?: string; model: string };
}): PreparedVideoGeneration | null {
  const resolved = resolveVideoConfig({ config, fallback });
  if (!resolved) {
    return null;
  }

  const selection = resolveVideoSelection({ config: resolved, toolOptions, toolId });
  if (!selection) {
    return null;
  }

  const adapter = createVideoAdapter({ config: resolved, providerName: selection.provider });

  return {
    adapter,
    provider: selection.provider,
    model: selection.model,
    capabilities: mergeCapabilities(adapter.capabilities, selection.capabilities),
    maxBytes: (resolved.maxFileSizeMB ?? DEFAULT_VIDEO_MAX_FILE_SIZE_MB) * BYTES_PER_MB,
  };
}

const toMB = (bytes: number): number => Math.round(bytes / BYTES_PER_MB);

/**
 * Streams a video the provider stored elsewhere, refusing one larger than the
 * configured ceiling. The cap is enforced while reading rather than after:
 * a wrong or absent `content-length` is the case it exists for.
 */
async function downloadVideo({
  url,
  maxBytes,
  signal,
}: {
  url: string;
  maxBytes: number;
  signal?: AbortSignal;
}): Promise<{ buffer: Buffer; mimeType?: string }> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Could not download the generated video: HTTP ${response.status}`);
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(
      `The generated video is ${toMB(declared)}MB, over the ${toMB(maxBytes)}MB limit.`,
    );
  }

  if (!response.body) {
    throw new Error('The provider returned an empty video response.');
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`The generated video exceeds the ${toMB(maxBytes)}MB limit.`);
    }
    chunks.push(Buffer.from(value));
  }

  const contentType = response.headers.get('content-type');
  return {
    buffer: Buffer.concat(chunks),
    mimeType: contentType?.startsWith('video/') ? contentType : undefined,
  };
}

/**
 * Runs one generation against the prepared provider and returns bytes.
 *
 * A provider that answers with a location has its video fetched here, so the
 * tool never learns which kind it is talking to — and a link that expires in a
 * day never reaches storage as an address nothing can resolve later.
 */
export async function generateVideo({
  prepared,
  request,
}: {
  prepared: PreparedVideoGeneration;
  request: Omit<VideoGenerationRequest, 'model'>;
}): Promise<VideoGenerationOutcome> {
  const result = await prepared.adapter.generate({ ...request, model: prepared.model });

  if (result.buffer) {
    return { buffer: result.buffer, mimeType: result.mimeType, previousId: result.previousId };
  }

  if (!result.url) {
    throw new Error('The provider returned no video.');
  }

  logger.debug('[video] Downloading generated video', {
    provider: prepared.provider,
    model: prepared.model,
  });

  const downloaded = await downloadVideo({
    url: result.url,
    maxBytes: prepared.maxBytes,
    signal: request.signal,
  });

  return {
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType || result.mimeType,
    previousId: result.previousId,
  };
}
