import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent } from './format';

describe('i18n format helpers', () => {
  it('formats numbers using the selected locale', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
    expect(formatNumber(1234, 'vi')).toBe('1.234');
  });

  it('formats percentages consistently', () => {
    expect(formatPercent(75, 'en')).toBe('75%');
  });
});
