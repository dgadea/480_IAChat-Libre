import type { TVideoGenerationConfig } from 'librechat-data-provider';
import type {
  VideoAdapter,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoAdapterCapabilities,
} from './types';
import type { PreparedVideoGeneration } from './generate';
import { generateVideo, prepareVideoGeneration } from './generate';
import { GEMINI_CAPABILITIES } from './gemini';

const MB = 1024 * 1024;

const capabilities: VideoAdapterCapabilities = {
  aspectRatios: ['16:9'],
  resolutions: [],
  durations: [5, 10],
  maxImages: 0,
  editing: false,
};

/** A real implementation of the interface rather than a module mock: the code
 *  under test receives its provider, so a substitute needs no stubbing. */
function stubAdapter(result: VideoGenerationResult | (() => Promise<VideoGenerationResult>)): {
  adapter: VideoAdapter;
  calls: VideoGenerationRequest[];
} {
  const calls: VideoGenerationRequest[] = [];
  return {
    calls,
    adapter: {
      capabilities,
      async generate(request) {
        calls.push(request);
        return typeof result === 'function' ? result() : result;
      },
    },
  };
}

const prepare = (adapter: VideoAdapter, maxBytes = 100 * MB): PreparedVideoGeneration => ({
  adapter,
  provider: 'stub',
  model: 'stub-video-1',
  capabilities,
  maxBytes,
});

const streamingResponse = (chunks: Uint8Array[], headers: Record<string, string> = {}) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    { headers },
  );

describe('prepareVideoGeneration', () => {
  const config: TVideoGenerationConfig = {
    default: 'studio',
    maxFileSizeMB: 12,
    providers: {
      studio: {
        adapter: 'gemini_omni',
        apiKey: 'key',
        /** A hypothetical model: Gemini Omni exposes no length control, so the
         *  override that proves the merge cannot come from a real Omni id. */
        models: [{ name: 'queued-video-1', capabilities: { durations: [5, 10] } }],
      },
    },
  };

  it('is null when neither configuration nor a fallback credential exists', () => {
    expect(
      prepareVideoGeneration({ toolId: 'gemini_video_gen', fallback: { model: 'x' } }),
    ).toBeNull();
  });

  it('reproduces the unconfigured deployment from its environment credential', () => {
    const prepared = prepareVideoGeneration({
      toolId: 'gemini_video_gen',
      fallback: { apiKey: 'env-key', model: 'gemini-omni-1.1-flash' },
    });

    expect(prepared?.model).toBe('gemini-omni-1.1-flash');
    expect(prepared?.capabilities).toEqual(GEMINI_CAPABILITIES);
  });

  it("applies the model's declared capabilities over the adapter's defaults", () => {
    const prepared = prepareVideoGeneration({ config, toolId: 'gemini_video_gen' });

    expect(prepared?.capabilities.durations).toEqual([5, 10]);
    expect(prepared?.capabilities.aspectRatios).toEqual(GEMINI_CAPABILITIES.aspectRatios);
  });

  it('turns the configured ceiling into bytes', () => {
    expect(prepareVideoGeneration({ config, toolId: 'gemini_video_gen' })?.maxBytes).toBe(12 * MB);
  });
});

describe('generateVideo', () => {
  /** A real function standing in for the transfer rather than a spy on the
   *  global: `restoreMocks` tears a global spy down between tests, and the
   *  assertions here are about what was requested, not that a mock was hit. */
  const originalFetch = global.fetch;
  let transfers: Array<{ url: string; signal?: AbortSignal }> = [];
  let respond: () => Promise<Response>;

  beforeEach(() => {
    transfers = [];
    respond = () => Promise.reject(new Error('no transfer expected'));
    /** `preconnect` rides along because the global's type carries it; the
     *  stand-in replaces the transfer, not the rest of the interface. */
    global.fetch = Object.assign(
      (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        transfers.push({ url: String(input), signal: init?.signal ?? undefined });
        return respond();
      },
      { preconnect: originalFetch.preconnect },
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('passes the resolved model and the request through to the adapter', async () => {
    const { adapter, calls } = stubAdapter({ buffer: Buffer.from('clip'), mimeType: 'video/mp4' });
    const signal = new AbortController().signal;

    await generateVideo({
      prepared: prepare(adapter),
      request: { prompt: 'a cat', duration: 10, aspectRatio: '16:9', signal },
    });

    expect(calls[0]).toEqual({
      prompt: 'a cat',
      duration: 10,
      aspectRatio: '16:9',
      model: 'stub-video-1',
      signal,
    });
  });

  it('returns bytes from a provider that answers with them, without fetching', async () => {
    const { adapter } = stubAdapter({
      buffer: Buffer.from('clip'),
      mimeType: 'video/mp4',
      previousId: 'interaction-1',
    });

    const outcome = await generateVideo({
      prepared: prepare(adapter),
      request: { prompt: 'a cat' },
    });

    expect(outcome).toEqual({
      buffer: Buffer.from('clip'),
      mimeType: 'video/mp4',
      previousId: 'interaction-1',
    });
    expect(transfers).toHaveLength(0);
  });

  it('downloads a provider that answers with a location, keeping the edit handle', async () => {
    respond = async () =>
      streamingResponse([new Uint8Array([1, 2]), new Uint8Array([3])], {
        'content-type': 'video/mp4',
      });
    const { adapter } = stubAdapter({
      url: 'https://provider.example/clip.mp4',
      mimeType: 'application/octet-stream',
      previousId: 'task-9',
    });

    const outcome = await generateVideo({
      prepared: prepare(adapter),
      request: { prompt: 'a cat' },
    });

    expect(transfers).toEqual([{ url: 'https://provider.example/clip.mp4', signal: undefined }]);
    expect(outcome.buffer).toEqual(Buffer.from([1, 2, 3]));
    /** The transfer knows the real type; the adapter only guessed. */
    expect(outcome.mimeType).toBe('video/mp4');
    expect(outcome.previousId).toBe('task-9');
  });

  it("keeps the adapter's type when the transfer does not declare a video one", async () => {
    respond = async () =>
      streamingResponse([new Uint8Array([1])], { 'content-type': 'application/octet-stream' });
    const { adapter } = stubAdapter({
      url: 'https://provider.example/clip',
      mimeType: 'video/mp4',
    });

    const outcome = await generateVideo({
      prepared: prepare(adapter),
      request: { prompt: 'a cat' },
    });

    expect(outcome.mimeType).toBe('video/mp4');
  });

  it('refuses a download the provider declares as over the ceiling, before reading it', async () => {
    respond = async () =>
      streamingResponse([new Uint8Array([1])], { 'content-length': String(20 * MB) });
    const { adapter } = stubAdapter({
      url: 'https://provider.example/big.mp4',
      mimeType: 'video/mp4',
    });

    await expect(
      generateVideo({ prepared: prepare(adapter, 2 * MB), request: { prompt: 'a cat' } }),
    ).rejects.toThrow(/20MB, over the 2MB limit/);
  });

  it('stops a download that outgrows the ceiling despite declaring nothing', async () => {
    respond = async () =>
      streamingResponse([new Uint8Array(600), new Uint8Array(600), new Uint8Array(600)]);
    const { adapter } = stubAdapter({
      url: 'https://provider.example/lie.mp4',
      mimeType: 'video/mp4',
    });

    await expect(
      generateVideo({ prepared: prepare(adapter, 1000), request: { prompt: 'a cat' } }),
    ).rejects.toThrow(/exceeds the 0MB limit/);
  });

  it('reports a failed download by its status', async () => {
    respond = async () => new Response('gone', { status: 404 });
    const { adapter } = stubAdapter({
      url: 'https://provider.example/gone.mp4',
      mimeType: 'video/mp4',
    });

    await expect(
      generateVideo({ prepared: prepare(adapter), request: { prompt: 'a cat' } }),
    ).rejects.toThrow(/Could not download the generated video: HTTP 404/);
  });

  it('reports a provider that returned neither bytes nor a location', async () => {
    const { adapter } = stubAdapter({ mimeType: 'video/mp4' });

    await expect(
      generateVideo({ prepared: prepare(adapter), request: { prompt: 'a cat' } }),
    ).rejects.toThrow(/returned no video/);
  });
});
