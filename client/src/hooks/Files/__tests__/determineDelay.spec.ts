import { determineDelay } from '../useDelayedUploadToast';

const MB = 1000000;

describe('determineDelay', () => {
  it('keeps the local-disk window when nothing is configured', () => {
    expect(determineDelay(0)).toBe(5000);
    expect(determineDelay(3 * MB)).toBe(11000);
  });

  it('uses a configured window for object storage', () => {
    const notice = { baseMs: 20000, perMbMs: 4000 };
    expect(determineDelay(0, notice)).toBe(20000);
    expect(determineDelay(3 * MB, notice)).toBe(32000);
  });

  it('falls back per field, so setting one keeps the other default', () => {
    expect(determineDelay(2 * MB, { baseMs: 20000 })).toBe(24000);
    expect(determineDelay(2 * MB, { perMbMs: 5000 })).toBe(15000);
  });

  it('accepts zero as a configured value rather than treating it as unset', () => {
    expect(determineDelay(3 * MB, { baseMs: 0, perMbMs: 0 })).toBe(0);
  });

  it('counts only whole megabytes', () => {
    expect(determineDelay(1.9 * MB)).toBe(7000);
  });
});
