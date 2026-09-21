import { DEFAULT_VIDEO_PARAMS, toToolSettings, VIDEO_TOOL_ID } from '../state';

describe('DEFAULT_VIDEO_PARAMS', () => {
  it('starts every session silent, at the native resolution, in landscape', () => {
    expect(DEFAULT_VIDEO_PARAMS).toEqual({
      aspect_ratio: '16:9',
      resolution: '720p',
      treatment: 'auto',
      sound: 'silent',
    });
  });
});

describe('toToolSettings', () => {
  it('sends shape and resolution, which the provider enforces', () => {
    expect(toToolSettings(DEFAULT_VIDEO_PARAMS)[VIDEO_TOOL_ID]).toMatchObject({
      aspect_ratio: '16:9',
      resolution: '720p',
    });
  });

  it('drops `auto`, so an unset control adds nothing to the prompt', () => {
    const settings = toToolSettings({ ...DEFAULT_VIDEO_PARAMS, treatment: 'auto', sound: 'auto' });
    expect(settings[VIDEO_TOOL_ID].treatment).toBeUndefined();
    expect(settings[VIDEO_TOOL_ID].sound).toBeUndefined();
  });

  it('sends direction the viewer did choose', () => {
    const settings = toToolSettings({
      ...DEFAULT_VIDEO_PARAMS,
      treatment: '3d',
      sound: 'silent',
    });
    expect(settings[VIDEO_TOOL_ID]).toMatchObject({ treatment: '3d', sound: 'silent' });
  });

  it('sends the silent default, which is a choice rather than an absence', () => {
    expect(toToolSettings(DEFAULT_VIDEO_PARAMS)[VIDEO_TOOL_ID].sound).toBe('silent');
  });
});
