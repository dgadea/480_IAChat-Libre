import { deriveTitleFromText } from './title';

describe('deriveTitleFromText', () => {
  it('returns null for text that is empty or only whitespace', () => {
    expect(deriveTitleFromText('')).toBeNull();
    expect(deriveTitleFromText('   \n\t ')).toBeNull();
    expect(deriveTitleFromText(undefined)).toBeNull();
    expect(deriveTitleFromText(null)).toBeNull();
  });

  it('keeps a short message verbatim', () => {
    expect(deriveTitleFromText('que ves en esta imagen?')).toBe('que ves en esta imagen?');
  });

  it('collapses newlines and runs of whitespace', () => {
    expect(deriveTitleFromText('hola\n\n  mundo\ttodo bien')).toBe('hola mundo todo bien');
  });

  it('cuts on a word boundary and marks the truncation', () => {
    const title = deriveTitleFromText('a'.repeat(20) + ' ' + 'b'.repeat(80), 30);
    expect(title).toBe(`${'a'.repeat(20)}…`);
  });

  it('cuts mid-word when no boundary is near the limit', () => {
    expect(deriveTitleFromText('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`);
  });

  it('does not truncate text that exactly fills the limit', () => {
    expect(deriveTitleFromText('y'.repeat(10), 10)).toBe('y'.repeat(10));
  });
});
