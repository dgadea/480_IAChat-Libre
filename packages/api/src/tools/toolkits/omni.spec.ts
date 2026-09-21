import { buildVideoGenSchema, resolveGeminiVideoParams } from './omni';
import { GEMINI_CAPABILITIES } from '../../video/gemini';

describe('resolveGeminiVideoParams', () => {
  it('is empty when neither the agent nor the request sets anything', () => {
    expect(resolveGeminiVideoParams({})).toEqual({});
  });

  it('takes the agent settings when the request carries none', () => {
    expect(
      resolveGeminiVideoParams({
        toolOptions: { gemini_video_gen: { aspect_ratio: '9:16', resolution: '1080p' } },
      }),
    ).toEqual({ aspect_ratio: '9:16', resolution: '1080p' });
  });

  it('lets the request override the agent, field by field', () => {
    expect(
      resolveGeminiVideoParams({
        toolOptions: { gemini_video_gen: { aspect_ratio: '16:9', resolution: '720p' } },
        requestParams: { gemini_video_gen: { aspect_ratio: '9:16' } },
      }),
    ).toEqual({ aspect_ratio: '9:16', resolution: '720p' });
  });

  it('drops values outside the API enums instead of forwarding them', () => {
    expect(
      resolveGeminiVideoParams({
        requestParams: { gemini_video_gen: { aspect_ratio: '4:3', resolution: '8k' } },
      }),
    ).toEqual({});
  });

  it('falls back to the agent when the request value is blank', () => {
    expect(
      resolveGeminiVideoParams({
        toolOptions: { gemini_video_gen: { aspect_ratio: '9:16' } },
        requestParams: { gemini_video_gen: { aspect_ratio: '  ' } },
      }),
    ).toEqual({ aspect_ratio: '9:16' });
  });

  it('ignores params belonging to another tool', () => {
    expect(
      resolveGeminiVideoParams({
        requestParams: { gemini_image_gen: { aspect_ratio: '9:16' } },
      }),
    ).toEqual({});
  });
});

describe('buildVideoGenSchema', () => {
  const properties = (capabilities?: Parameters<typeof buildVideoGenSchema>[0]) =>
    Object.keys(buildVideoGenSchema(capabilities).properties ?? {});

  it('describes Gemini Omni when no provider is named', () => {
    const schema = buildVideoGenSchema();

    expect(properties()).toEqual([
      'prompt',
      'image_ids',
      'previous_interaction_id',
      'aspect_ratio',
      'resolution',
    ]);
    expect(schema.required).toEqual(['prompt', 'aspect_ratio']);
    expect(schema.properties?.aspect_ratio).toMatchObject({ enum: ['16:9', '9:16'] });
  });

  it("offers the model's own shapes rather than a constant", () => {
    const schema = buildVideoGenSchema({
      ...GEMINI_CAPABILITIES,
      aspectRatios: ['16:9', '9:16', '1:1'],
    });

    expect(schema.properties?.aspect_ratio).toMatchObject({ enum: ['16:9', '9:16', '1:1'] });
  });

  it('offers duration only for a provider that bills by it', () => {
    expect(properties()).not.toContain('duration');
    expect(properties({ ...GEMINI_CAPABILITIES, durations: [5, 10] })).toContain('duration');
  });

  it('omits the edit handle when the provider cannot edit', () => {
    expect(properties({ ...GEMINI_CAPABILITIES, editing: false })).not.toContain(
      'previous_interaction_id',
    );
  });

  it('omits image input for a text-only provider', () => {
    expect(properties({ ...GEMINI_CAPABILITIES, maxImages: 0 })).not.toContain('image_ids');
  });

  it('caps image input at what the provider accepts', () => {
    expect(
      buildVideoGenSchema({ ...GEMINI_CAPABILITIES, maxImages: 1 }).properties?.image_ids,
    ).toMatchObject({ maxItems: 1 });
  });

  it('stops requiring a shape the provider does not let anyone choose', () => {
    expect(buildVideoGenSchema({ ...GEMINI_CAPABILITIES, aspectRatios: [] }).required).toEqual([
      'prompt',
    ]);
  });

  it('omits resolution for a provider that exposes no such control', () => {
    expect(properties({ ...GEMINI_CAPABILITIES, resolutions: [] })).not.toContain('resolution');
  });
});

describe('resolveGeminiVideoParams — creative direction', () => {
  it('omits direction the user did not choose', () => {
    expect(
      resolveGeminiVideoParams({
        requestParams: { gemini_video_gen: { aspect_ratio: '16:9' } },
      }),
    ).toEqual({ aspect_ratio: '16:9' });
  });

  it('carries treatment and sound through', () => {
    expect(
      resolveGeminiVideoParams({
        requestParams: { gemini_video_gen: { treatment: '3d', sound: 'silent' } },
      }),
    ).toEqual({ treatment: '3d', sound: 'silent' });
  });

  it('drops direction outside the known sets', () => {
    expect(
      resolveGeminiVideoParams({
        requestParams: { gemini_video_gen: { treatment: 'claymation', sound: 'surround' } },
      }),
    ).toEqual({});
  });

  it('lets the request override the agent for direction too', () => {
    expect(
      resolveGeminiVideoParams({
        toolOptions: { gemini_video_gen: { treatment: 'live_action', sound: 'music' } },
        requestParams: { gemini_video_gen: { treatment: 'animation' } },
      }),
    ).toEqual({ treatment: 'animation', sound: 'music' });
  });
});

describe('buildVideoGenSchema — parameters the user already fixed', () => {
  it('offers both controls when the composer fixed nothing', () => {
    const schema = buildVideoGenSchema();
    expect(schema.properties?.aspect_ratio).toBeDefined();
    expect(schema.properties?.resolution).toBeDefined();
    expect(schema.required).toContain('aspect_ratio');
  });

  it('drops a fixed aspect ratio, and stops requiring it', () => {
    const schema = buildVideoGenSchema(undefined, { aspect_ratio: '9:16' });
    expect(schema.properties?.aspect_ratio).toBeUndefined();
    expect(schema.required).toEqual(['prompt']);
    expect(schema.properties?.resolution).toBeDefined();
  });

  it('drops a fixed resolution and leaves the shape choosable', () => {
    const schema = buildVideoGenSchema(undefined, { resolution: '1080p' });
    expect(schema.properties?.resolution).toBeUndefined();
    expect(schema.properties?.aspect_ratio).toBeDefined();
    expect(schema.required).toContain('aspect_ratio');
  });

  it('keeps the prompt whatever is fixed', () => {
    const schema = buildVideoGenSchema(undefined, { aspect_ratio: '16:9', resolution: '720p' });
    expect(schema.properties?.prompt).toBeDefined();
    expect(schema.required).toEqual(['prompt']);
  });

  it('is unaffected by direction, which is never a schema argument', () => {
    const schema = buildVideoGenSchema(undefined, { treatment: '3d', sound: 'silent' });
    expect(schema.properties?.aspect_ratio).toBeDefined();
    expect(schema.properties?.treatment).toBeUndefined();
    expect(schema.properties?.sound).toBeUndefined();
  });
});
