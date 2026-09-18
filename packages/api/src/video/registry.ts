import type { TVideoGenerationConfig, AgentToolOptions } from 'librechat-data-provider';
import type { VideoAdapter, VideoAdapterFactory, ResolvedVideoProvider } from './types';
import { createGeminiVideoAdapter } from './gemini';

/** Every adapter the deployment can name in `videoGeneration.providers[].adapter`. */
const adapterFactories: Record<string, VideoAdapterFactory> = {
  gemini_omni: createGeminiVideoAdapter,
};

/** One selectable entry, flattened across providers for menus and tool enums. */
export interface VideoModelChoice {
  provider: string;
  model: string;
  description?: string;
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
    baseURL: provider.baseURL,
    models: provider.models,
  };
  return factory(resolved);
}
