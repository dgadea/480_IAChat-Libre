import type { AgentToolOptions } from 'librechat-data-provider';
import { DEFAULT_GEMINI_IMAGE_MODEL, resolveGeminiImageModel } from './gemini';

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
