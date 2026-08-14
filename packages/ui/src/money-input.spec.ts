import { describe, expect, it } from 'vitest';
import { toMinorUnits } from './money-input';

describe('toMinorUnits', () => {
  it('converts whole and decimal amounts', () => {
    expect(toMinorUnits('25')).toBe('2500');
    expect(toMinorUnits('25.00')).toBe('2500');
    expect(toMinorUnits('25.5')).toBe('2550');
    expect(toMinorUnits('0.05')).toBe('5');
  });

  it('strips leading zeros without losing value', () => {
    expect(toMinorUnits('007.10')).toBe('710');
  });

  it('rejects zero, negatives, and junk', () => {
    expect(toMinorUnits('0')).toBeNull();
    expect(toMinorUnits('0.00')).toBeNull();
    expect(toMinorUnits('-5')).toBeNull();
    expect(toMinorUnits('5.123')).toBeNull();
    expect(toMinorUnits('five')).toBeNull();
    expect(toMinorUnits('')).toBeNull();
  });

  it('handles amounts beyond the safe integer range', () => {
    expect(toMinorUnits('90071992547409.93')).toBe('9007199254740993');
  });
});
