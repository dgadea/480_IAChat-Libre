import type { TVideoGenerationConfig } from 'librechat-data-provider';
import type { VideoAdapterCapabilities } from './types';
import {
  mergeCapabilities,
  createVideoAdapter,
  listVideoModels,
  resolveVideoConfig,
  resolveVideoSelection,
  IMPLICIT_PROVIDER_NAME,
} from './registry';
import { GEMINI_CAPABILITIES } from './gemini';

const config: TVideoGenerationConfig = {
  default: 'secondary',
  maxFileSizeMB: 100,
  providers: {
    primary: {
      adapter: 'gemini_omni',
      apiKey: 'primary-key',
      models: [{ name: 'gemini-omni-1.1-flash' }],
    },
    /** Stands for a provider whose adapter does not exist yet: the capability
     *  overrides are the point, and attaching invented ones to a real model id
     *  would put a configuration nobody can run in front of the next reader. */
    secondary: {
      adapter: 'gemini_omni',
      apiKey: 'secondary-key',
      models: [{ name: 'queued-video-1', capabilities: { durations: [5, 10], editing: false } }],
    },
  },
};

describe('resolveVideoConfig', () => {
  it('synthesizes the provider a deployment never wrote from the credential it has', () => {
    const resolved = resolveVideoConfig({
      fallback: { apiKey: 'env-key', model: 'gemini-omni-1.1-flash' },
    });

    expect(resolved?.providers[IMPLICIT_PROVIDER_NAME]).toEqual({
      adapter: 'gemini_omni',
      apiKey: 'env-key',
      models: [{ name: 'gemini-omni-1.1-flash' }],
    });
  });

  it('is null when nothing is configured and no credential exists', () => {
    expect(resolveVideoConfig({ fallback: { model: 'gemini-omni-1.1-flash' } })).toBeNull();
    expect(resolveVideoConfig({})).toBeNull();
  });

  it('keeps a configured block rather than shadowing it with the fallback', () => {
    const resolved = resolveVideoConfig({
      config,
      fallback: { apiKey: 'env-key', model: 'other' },
    });

    expect(resolved).toBe(config);
    expect(resolved?.providers[IMPLICIT_PROVIDER_NAME]).toBeUndefined();
  });

  it('treats an empty providers map as no configuration at all', () => {
    const resolved = resolveVideoConfig({
      config: { providers: {}, maxFileSizeMB: 100 },
      fallback: { apiKey: 'env-key', model: 'gemini-omni-1.1-flash' },
    });

    expect(resolved?.providers[IMPLICIT_PROVIDER_NAME]).toBeDefined();
  });
});

describe('listVideoModels', () => {
  it('flattens every provider/model pair and carries the declared capabilities', () => {
    expect(listVideoModels(config)).toEqual([
      {
        provider: 'primary',
        model: 'gemini-omni-1.1-flash',
        description: undefined,
        capabilities: undefined,
      },
      {
        provider: 'secondary',
        model: 'queued-video-1',
        description: undefined,
        capabilities: { durations: [5, 10], editing: false },
      },
    ]);
  });

  it('is empty when nothing is configured', () => {
    expect(listVideoModels(null)).toEqual([]);
  });
});

describe('resolveVideoSelection', () => {
  it('prefers the deployment default over declaration order', () => {
    expect(resolveVideoSelection({ config, toolId: 'gemini_video_gen' })?.provider).toBe(
      'secondary',
    );
  });

  it("lets the agent's own model win over the deployment default", () => {
    const selection = resolveVideoSelection({
      config,
      toolId: 'gemini_video_gen',
      toolOptions: { gemini_video_gen: { image_model: 'gemini-omni-1.1-flash' } },
    });

    expect(selection?.provider).toBe('primary');
  });

  it('falls back to the first provider when the default names nothing configured', () => {
    const selection = resolveVideoSelection({
      config: { ...config, default: 'missing' },
      toolId: 'gemini_video_gen',
    });

    expect(selection?.provider).toBe('primary');
  });

  it('ignores a model the deployment does not offer instead of forwarding it', () => {
    const selection = resolveVideoSelection({
      config,
      toolId: 'gemini_video_gen',
      requestedModel: 'sora-9',
    });

    expect(selection?.model).toBe('queued-video-1');
  });
});

describe('mergeCapabilities', () => {
  it('returns the adapter defaults untouched when the model declares none', () => {
    expect(mergeCapabilities(GEMINI_CAPABILITIES)).toBe(GEMINI_CAPABILITIES);
  });

  it('overrides field by field, keeping what the model did not mention', () => {
    const merged: VideoAdapterCapabilities = mergeCapabilities(GEMINI_CAPABILITIES, {
      durations: [5, 10],
      editing: false,
    });

    expect(merged).toEqual({
      aspectRatios: GEMINI_CAPABILITIES.aspectRatios,
      resolutions: GEMINI_CAPABILITIES.resolutions,
      durations: [5, 10],
      maxImages: GEMINI_CAPABILITIES.maxImages,
      editing: false,
    });
  });

  it('honors an explicitly emptied list rather than falling back to the default', () => {
    expect(mergeCapabilities(GEMINI_CAPABILITIES, { resolutions: [] }).resolutions).toEqual([]);
  });

  it('honors maxImages zero for a text-only model', () => {
    expect(mergeCapabilities(GEMINI_CAPABILITIES, { maxImages: 0 }).maxImages).toBe(0);
  });
});

describe('createVideoAdapter', () => {
  it('builds the adapter a configured provider names', () => {
    const adapter = createVideoAdapter({ config, providerName: 'primary' });
    expect(adapter.capabilities).toEqual(GEMINI_CAPABILITIES);
  });

  it('names the available adapters when the config names one that does not exist', () => {
    expect(() =>
      createVideoAdapter({
        config: {
          maxFileSizeMB: 100,
          providers: {
            typo: { adapter: 'gemini-omni' as 'gemini_omni', models: [{ name: 'x' }] },
          },
        },
        providerName: 'typo',
      }),
    ).toThrow(/Unknown video adapter "gemini-omni". Available: gemini_omni/);
  });

  it('sends the credential an environment reference names, not the reference', async () => {
    process.env.VIDEO_TEST_KEY = 'resolved-key';
    const originalFetch = global.fetch;
    const urls: string[] = [];
    global.fetch = Object.assign(
      (input: URL | RequestInfo): Promise<Response> => {
        urls.push(String(input));
        return Promise.resolve(
          Response.json({ steps: [{ content: [{ type: 'video', data: 'AA==' }] }] }),
        );
      },
      { preconnect: originalFetch.preconnect },
    );

    try {
      const adapter = createVideoAdapter({
        config: {
          maxFileSizeMB: 100,
          providers: {
            env: {
              adapter: 'gemini_omni',
              apiKey: '${VIDEO_TEST_KEY}',
              models: [{ name: 'gemini-omni-1.1-flash' }],
            },
          },
        },
        providerName: 'env',
      });

      await adapter.generate({ prompt: 'a cat', model: 'gemini-omni-1.1-flash' });

      expect(urls[0]).toContain('key=resolved-key');
      expect(urls[0]).not.toContain('VIDEO_TEST_KEY');
    } finally {
      global.fetch = originalFetch;
      delete process.env.VIDEO_TEST_KEY;
    }
  });

  it('throws for a provider that is not configured at all', () => {
    expect(() => createVideoAdapter({ config, providerName: 'absent' })).toThrow(
      /Video provider "absent" is not configured/,
    );
  });
});
