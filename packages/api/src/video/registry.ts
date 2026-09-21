import { DEFAULT_VIDEO_MAX_FILE_SIZE_MB } from 'librechat-data-provider';
import type {
  AgentToolOptions,
  TVideoCapabilities,
  TVideoGenerationConfig,
} from 'librechat-data-provider';
import type {
  VideoAdapter,
  VideoAdapterFactory,
  VideoAdapterCapabilities,
  ResolvedVideoProvider,
} from './types';
import { createGeminiVideoAdapter } from './gemini';

/** Every adapter the deployment can name in `videoGeneration.providers[].adapter`. */
const adapterFactories: Record<string, VideoAdapterFactory> = {
  gemini_omni: createGeminiVideoAdapter,
};

/** Name given to the provider synthesized when `librechat.yaml` declares no
 *  `videoGeneration` block at all. */
export const IMPLICIT_PROVIDER_NAME = 'gemini';

/**
 * The deployment's video configuration, or an equivalent one built from the
 * credentials the tool already holds.
 *
 * Every deployment generating video today does so without a `videoGeneration`
 * block — the tool reads its key from the environment and its model from
 * `GEMINI_VIDEO_MODEL`. Synthesizing the provider they never wrote keeps those
 * deployments working unchanged once the tool routes through this registry,
 * instead of making the refactor an upgrade note.
 *
 * Returns null when nothing is configured and no fallback key exists, which the
 * caller reports as the missing-credential case rather than as a failure.
 */
export function resolveVideoConfig({
  config,
  fallback,
}: {
  config?: TVideoGenerationConfig | null;
  fallback?: { apiKey?: string; model: string };
}): TVideoGenerationConfig | null {
  if (config?.providers && Object.keys(config.providers).length > 0) {
    return config;
  }

  if (!fallback?.apiKey) {
    return null;
  }

  return {
    default: IMPLICIT_PROVIDER_NAME,
    maxFileSizeMB: config?.maxFileSizeMB ?? DEFAULT_VIDEO_MAX_FILE_SIZE_MB,
    providers: {
      [IMPLICIT_PROVIDER_NAME]: {
        adapter: 'gemini_omni',
        apiKey: fallback.apiKey,
        models: [{ name: fallback.model }],
      },
    },
  };
}

/** One selectable entry, flattened across providers for menus and tool enums. */
export interface VideoModelChoice {
  provider: string;
  model: string;
  description?: string;
  capabilities?: TVideoCapabilities;
}

/**
 * The adapter's defaults with the model's declared overrides applied.
 *
 * Merged field by field rather than wholesale, so a model that differs only in
 * the lengths it bills for says just that in `librechat.yaml` and keeps
 * everything else its provider already supports.
 */
export function mergeCapabilities(
  defaults: VideoAdapterCapabilities,
  overrides?: TVideoCapabilities,
): VideoAdapterCapabilities {
  if (!overrides) {
    return defaults;
  }
  return {
    aspectRatios: overrides.aspectRatios ?? defaults.aspectRatios,
    resolutions: overrides.resolutions ?? defaults.resolutions,
    durations: overrides.durations ?? defaults.durations,
    maxImages: overrides.maxImages ?? defaults.maxImages,
    editing: overrides.editing ?? defaults.editing,
  };
}

/**
 * Every configured provider/model pair. The tool turns this into the enum the
 * model chooses from, so a model absent here can never be requested.
 */
export function listVideoModels(config?: TVideoGenerationConfig | null): VideoModelChoice[] {
  const providers = config?.providers;
  if (!providers) {
    return [];
  }

  const choices: VideoModelChoice[] = [];
  for (const [providerName, provider] of Object.entries(providers)) {
    for (const model of provider.models) {
      choices.push({
        provider: providerName,
        model: model.name,
        description: model.description,
        capabilities: model.capabilities,
      });
    }
  }
  return choices;
}

/**
 * Picks the provider/model for one call. Precedence runs from most specific to
 * least: what the model asked for, then the agent's own `tool_options`, then the
 * deployment default, then the first configured provider.
 */
export function resolveVideoSelection({
  config,
  toolOptions,
  toolId,
  requestedModel,
}: {
  config?: TVideoGenerationConfig | null;
  toolOptions?: AgentToolOptions | null;
  toolId: string;
  requestedModel?: string;
}): VideoModelChoice | null {
  const choices = listVideoModels(config);
  if (choices.length === 0) {
    return null;
  }

  const agentModel = toolOptions?.[toolId]?.image_model?.trim();
  for (const candidate of [requestedModel?.trim(), agentModel]) {
    if (!candidate) {
      continue;
    }
    const match = choices.find((choice) => choice.model === candidate);
    if (match) {
      return match;
    }
  }

  const defaultProvider = config?.default;
  if (defaultProvider) {
    const match = choices.find((choice) => choice.provider === defaultProvider);
    if (match) {
      return match;
    }
  }

  return choices[0];
}

/**
 * Builds the adapter for one selection. Throws when the config names an adapter
 * that no factory implements, so a typo in `librechat.yaml` fails loudly at use
 * rather than silently generating nothing.
 */
export function createVideoAdapter({
  config,
  providerName,
}: {
  config?: TVideoGenerationConfig | null;
  providerName: string;
}): VideoAdapter {
  const provider = config?.providers?.[providerName];
  if (!provider) {
    throw new Error(`Video provider "${providerName}" is not configured.`);
  }

  const factory = adapterFactories[provider.adapter];
  if (!factory) {
    const known = Object.keys(adapterFactories).join(', ');
    throw new Error(`Unknown video adapter "${provider.adapter}". Available: ${known}.`);
  }

  const resolved: ResolvedVideoProvider = {
    name: providerName,
    adapter: provider.adapter,
    apiKey: provider.apiKey,
    apiSecret: provider.apiSecret,
    baseURL: provider.baseURL,
    models: provider.models,
  };
  return factory(resolved);
}
