import { buildVideoToolContext, composeVideoToolContext } from './context';

describe('buildVideoToolContext', () => {
  it('is empty when the composer selected nothing', () => {
    expect(buildVideoToolContext({})).toBe('');
  });

  it('explains how a portrait frame composes', () => {
    const text = buildVideoToolContext({ aspect_ratio: '9:16' });
    expect(text).toContain('9:16');
    expect(text).toContain('tall portrait frame');
    expect(text).toContain('crop');
  });

  it('explains how a landscape frame composes', () => {
    expect(buildVideoToolContext({ aspect_ratio: '16:9' })).toContain('wide landscape frame');
  });

  it('states an unrecognised shape without inventing guidance for it', () => {
    const formatLine = buildVideoToolContext({ aspect_ratio: '1:1' })
      .split('\n')
      .find((line) => line.startsWith('- Format:'));
    expect(formatLine).toBe('- Format: 1:1');
  });

  it('names treatment and sound in words rather than identifiers', () => {
    const text = buildVideoToolContext({ treatment: 'motion_graphics', sound: 'silent' });
    expect(text).toContain('motion graphics');
    expect(text).toContain('no audio');
    expect(text).not.toContain('motion_graphics');
  });

  it('tells the model the settings are fixed and not negotiable in chat', () => {
    const text = buildVideoToolContext({ resolution: '720p' });
    expect(text).toContain('regardless of what you pass');
    expect(text).toContain('above the message box');
  });
});

describe('composeVideoToolContext', () => {
  const params = { aspect_ratio: '9:16' };

  it('returns only the settings when there are no images', () => {
    expect(composeVideoToolContext({ imageContext: '', params })).toBe(
      buildVideoToolContext(params),
    );
  });

  it('returns only the images when the composer selected nothing', () => {
    expect(composeVideoToolContext({ imageContext: 'IMAGES', params: {} })).toBe('IMAGES');
  });

  it('keeps the image context first, separated from the settings', () => {
    const text = composeVideoToolContext({ imageContext: 'IMAGES', params });
    expect(text.startsWith('IMAGES\n\n')).toBe(true);
    expect(text).toContain('9:16');
  });

  it('is empty when there is neither', () => {
    expect(composeVideoToolContext({ imageContext: '', params: {} })).toBe('');
  });
});
