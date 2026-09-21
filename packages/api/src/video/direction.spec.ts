import { describeVideoDirection, applyVideoDirection } from './direction';

describe('describeVideoDirection', () => {
  it('adds nothing when neither control is set', () => {
    expect(describeVideoDirection({})).toBe('');
  });

  it('describes the treatment alone', () => {
    const text = describeVideoDirection({ treatment: '3d' });
    expect(text).toContain('3D CG animation');
    expect(text).not.toContain('Audio:');
  });

  it('describes the sound alone', () => {
    const text = describeVideoDirection({ sound: 'silent' });
    expect(text).toContain('Audio: none');
    expect(text).not.toContain('Treatment:');
  });

  it('describes both, one per line', () => {
    const text = describeVideoDirection({ treatment: 'live_action', sound: 'music' });
    expect(text.trim().split('\n')).toHaveLength(2);
    expect(text).toContain('live action');
    expect(text).toContain('music track');
  });

  it('separates the direction from the prompt with a blank line', () => {
    expect(describeVideoDirection({ sound: 'ambient' }).startsWith('\n\n')).toBe(true);
  });
});

describe('applyVideoDirection', () => {
  it('leaves an undirected prompt byte-for-byte unchanged', () => {
    const prompt = 'Slow push in on a cup of coffee, steam drifting left.';
    expect(applyVideoDirection(prompt, {})).toBe(prompt);
  });

  it('keeps the user prompt first and appends the direction', () => {
    const prompt = 'A cyclist crossing a bridge at dawn.';
    const result = applyVideoDirection(prompt, { treatment: 'motion_graphics' });
    expect(result.startsWith(prompt)).toBe(true);
    expect(result).toContain('Typography, shapes');
  });
});
