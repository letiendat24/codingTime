import { describe, expect, it } from 'vitest';
import { statusToneMap } from './colors';

describe('statusToneMap', () => {
  it('maps common product statuses to semantic tones', () => {
    expect(statusToneMap.COMPLETED).toBe('success');
    expect(statusToneMap.FAILED).toBe('danger');
    expect(statusToneMap.PROCESSING).toBe('info');
    expect(statusToneMap.DRAFT).toBe('neutral');
  });
});
