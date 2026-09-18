import type { AgentToolOptions } from 'librechat-data-provider';
import { DEFAULT_GEMINI_IMAGE_MODEL, resolveGeminiImageModel } from './gemini';
import { DEFAULT_GEMINI_VIDEO_MODEL, resolveGeminiVideoModel } from './omni';
import { DEFAULT_OPENAI_IMAGE_MODEL, resolveOpenAIImageModel } from './oai';

describe('resolveGeminiImageModel', () => {
  const originalModel = process.env.GEMINI_IMAGE_MODEL;

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.GEMINI_IMAGE_MODEL;
      return;
    }
    process.env.GEMINI_IMAGE_MODEL = originalModel;
  });

  it('falls back to the built-in default when nothing is configured', () => {
    delete process.env.GEMINI_IMAGE_MODEL;
    expect(resolveGeminiImageModel()).toBe(DEFAULT_GEMINI_IMAGE_MODEL);
  });

  it('uses the deployment model when the agent selects none', () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
    expect(resolveGeminiImageModel()).toBe('gemini-3.1-flash-image');
    expect(resolveGeminiImageModel({})).toBe('gemini-3.1-flash-image');
  });

  it("prefers the agent's own model over the deployment model", () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
    const toolOptions: AgentToolOptions = {
      gemini_image_gen: { image_model: 'gemini-3-pro-image' },
    };
    expect(resolveGeminiImageModel(toolOptions)).toBe('gemini-3-pro-image');
  });

  it('ignores a blank agent model instead of generating with an empty name', () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
    const toolOptions: AgentToolOptions = {
      gemini_image_gen: { image_model: '   ' },
    };
    expect(resolveGeminiImageModel(toolOptions)).toBe('gemini-3.1-flash-image');
  });

  it('trims a padded agent model so the provider receives a clean name', () => {
    const toolOptions: AgentToolOptions = {
      gemini_image_gen: { image_model: '  gemini-3-pro-image  ' },
    };
    expect(resolveGeminiImageModel(toolOptions)).toBe('gemini-3-pro-image');
  });

  it("leaves another tool's options alone", () => {
    process.env.GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
    const toolOptions: AgentToolOptions = {
      image_gen_oai: { image_model: 'gpt-image-1' },
    };
    expect(resolveGeminiImageModel(toolOptions)).toBe('gemini-3.1-flash-image');
  });
});

describe('resolveOpenAIImageModel', () => {
  const originalModel = process.env.IMAGE_GEN_OAI_MODEL;

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.IMAGE_GEN_OAI_MODEL;
      return;
    }
    process.env.IMAGE_GEN_OAI_MODEL = originalModel;
  });

  it('falls back to the built-in default when nothing is configured', () => {
    delete process.env.IMAGE_GEN_OAI_MODEL;
    expect(resolveOpenAIImageModel()).toBe(DEFAULT_OPENAI_IMAGE_MODEL);
  });

  it("prefers the agent's own model over the deployment model", () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-1';
    const toolOptions: AgentToolOptions = {
      image_gen_oai: { image_model: 'gpt-image-2' },
    };
    expect(resolveOpenAIImageModel(toolOptions)).toBe('gpt-image-2');
  });

  it('reads its own tool key, not the Gemini one', () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-1';
    const toolOptions: AgentToolOptions = {
      gemini_image_gen: { image_model: 'gemini-3-pro-image' },
    };
    expect(resolveOpenAIImageModel(toolOptions)).toBe('gpt-image-1');
  });
});

describe('resolveGeminiVideoModel', () => {
  const originalModel = process.env.GEMINI_VIDEO_MODEL;

  afterEach(() => {
    if (originalModel === undefined) {
      delete process.env.GEMINI_VIDEO_MODEL;
      return;
    }
    process.env.GEMINI_VIDEO_MODEL = originalModel;
  });

  it('falls back to the built-in default when nothing is configured', () => {
    delete process.env.GEMINI_VIDEO_MODEL;
    expect(resolveGeminiVideoModel()).toBe(DEFAULT_GEMINI_VIDEO_MODEL);
  });

  it("prefers the agent's own model over the deployment model", () => {
    process.env.GEMINI_VIDEO_MODEL = 'gemini-omni-1.1-flash';
    const toolOptions: AgentToolOptions = {
      gemini_video_gen: { image_model: 'gemini-omni-flash-preview' },
    };
    expect(resolveGeminiVideoModel(toolOptions)).toBe('gemini-omni-flash-preview');
  });

  it("does not read the image tools' keys", () => {
    process.env.GEMINI_VIDEO_MODEL = 'gemini-omni-1.1-flash';
    const toolOptions: AgentToolOptions = {
      gemini_image_gen: { image_model: 'gemini-3-pro-image' },
      image_gen_oai: { image_model: 'gpt-image-2.5-flare' },
    };
    expect(resolveGeminiVideoModel(toolOptions)).toBe('gemini-omni-1.1-flash');
  });
});
