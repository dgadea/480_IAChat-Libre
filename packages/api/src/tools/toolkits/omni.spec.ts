import { resolveGeminiVideoParams } from './omni';

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
