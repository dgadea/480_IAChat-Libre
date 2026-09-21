import type { TVideoCapabilities } from 'librechat-data-provider';

/** One reference frame handed to a provider as generation input. */
export interface VideoImageInput {
  /** Base64-encoded bytes, without a data-URL prefix. */
  data: string;
  mimeType: string;
}

/** One generation request, in terms every provider can express. */
export interface VideoGenerationRequest {
  prompt: string;
  model: string;
  aspectRatio?: string;
  resolution?: string;
  /** Length in seconds. Providers that bill by length read it; Gemini Omni has
   *  no such control and ignores it. */
  duration?: number;
  /** Reference frames in order: one is a starting frame, two are read as first
   *  and last with the motion interpolated between them. */
  images?: VideoImageInput[];
  /** Provider-specific handle for editing a video generated earlier. */
  previousId?: string;
  /** Aborts a generation in flight. Queue-based providers poll for minutes, so
   *  without it a cancelled turn keeps paying for a video nobody will see. */
  signal?: AbortSignal;
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

/**
 * What one model can actually do. The tool builds its argument schema from
 * this rather than from a constant, so a model that offers 1:1, bills by
 * duration, or cannot edit at all describes itself without a branch in shared
 * code.
 *
 * An adapter publishes these as the defaults for its provider; a model entry in
 * `librechat.yaml` overrides them field by field. That split is what keeps
 * adding a model a configuration change rather than a code change.
 */
export interface VideoAdapterCapabilities {
  aspectRatios: string[];
  /** Empty when the provider exposes no resolution control of its own. */
  resolutions: string[];
  /** Selectable lengths in seconds; empty when the provider fixes the length. */
  durations: number[];
  /** Reference frames accepted; 0 for a text-only provider. */
  maxImages: number;
  /** Whether `previousId` edits an earlier video rather than being ignored. */
  editing: boolean;
}

/** What a provider must implement. One method: a second provider is a new
 *  file, not a branch inside the tool. */
export interface VideoAdapter {
  readonly capabilities: VideoAdapterCapabilities;
  generate(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
}

/** One model a provider offers, with the capability overrides the operator
 *  declared for it. */
export interface VideoModelEntry {
  name: string;
  description?: string;
  capabilities?: TVideoCapabilities;
}

/** A provider entry from `librechat.yaml`, with its credentials resolved. */
export interface ResolvedVideoProvider {
  name: string;
  adapter: string;
  apiKey?: string;
  apiSecret?: string;
  baseURL?: string;
  models: VideoModelEntry[];
}

export type VideoAdapterFactory = (provider: ResolvedVideoProvider) => VideoAdapter;
