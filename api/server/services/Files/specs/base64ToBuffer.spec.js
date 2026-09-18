const { base64ToBuffer } = require('../process');

/** A minimal but real MP4 header: bytes 4-8 spell `ftyp`, which is what every
 *  player checks first and what a mis-stripped data URL prefix destroys. */
const MP4_HEADER = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

describe('base64ToBuffer', () => {
  it('strips a media type containing digits', () => {
    const url = `data:video/mp4;base64,${MP4_HEADER.toString('base64')}`;
    const { buffer, type } = base64ToBuffer(url);
    expect(type).toBe('video/mp4');
    expect(buffer.subarray(4, 8).toString('ascii')).toBe('ftyp');
    expect(buffer.equals(MP4_HEADER)).toBe(true);
  });

  it('keeps working for the image types that always did', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { buffer, type } = base64ToBuffer(`data:image/png;base64,${png.toString('base64')}`);
    expect(type).toBe('image/png');
    expect(buffer.equals(png)).toBe(true);
  });

  it('handles a type carrying a plus', () => {
    const svg = Buffer.from('<svg/>');
    const { type } = base64ToBuffer(`data:image/svg+xml;base64,${svg.toString('base64')}`);
    expect(type).toBe('image/svg+xml');
  });

  it('decodes a bare base64 string with no prefix', () => {
    const raw = Buffer.from('hello');
    const { buffer, type } = base64ToBuffer(raw.toString('base64'));
    expect(type).toBe('');
    expect(buffer.equals(raw)).toBe(true);
  });
});
