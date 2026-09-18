/** One generation request, in terms every provider can express. */
export interface VideoGenerationRequest {
  prompt: string;
  model: string;
  aspectRatio?: string;
  resolution?: string;
  /** Provider-specific handle for editing a video generated earlier. */
  previousId?: string;
}

/**
 * A finished video. Providers return bytes or a location, never both — the
 * caller persists whichever arrives, so a URL-returning provider needs no
 * special path through the tool.
 */
export interface VideoGenerationResult {
  buffer?: Buffer;
  url?: string;
  mimeType: string;
  /** Handle the next turn passes back as `previousId` to edit this video. */
  previousId?: string;
}

/** What a provider must implement. One method: a second provider is a new
 *  file, not a branch inside the tool. */
export interface VideoAdapter {
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
}

/** A provider entry from `librechat.yaml`, with its credentials resolved. */
export interface ResolvedVideoProvider {
  name: string;
  adapter: string;
  apiKey?: string;
  baseURL?: string;
  models: Array<{ name: string; description?: string }>;
}

export type VideoAdapterFactory = (provider: ResolvedVideoProvider) => VideoAdapter;
