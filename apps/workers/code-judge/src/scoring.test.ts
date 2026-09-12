import { describe, expect, it } from 'vitest';
import { calculateScore } from './scoring';

describe('judge scoring', () => {
  it('calculates weighted score on a 0-100 scale', () => {
    expect(calculateScore({
      scoringMode: 'WEIGHTED',
      passScore: 70,
      testWeights: [20, 30, 50],
      passedWeights: [20, 50],
    })).toEqual({ score: 70, passed: true });
  });

  it('requires every test for all-or-nothing scoring', () => {
    expect(calculateScore({
      scoringMode: 'ALL_OR_NOTHING',
      passScore: 70,
      testWeights: [1, 1],
      passedWeights: [1],
    })).toEqual({ score: 0, passed: false });
  });

  it('applies pass threshold', () => {
    expect(calculateScore({
      scoringMode: 'WEIGHTED',
      passScore: 80,
      testWeights: [1, 1],
      passedWeights: [1],
    })).toEqual({ score: 50, passed: false });
  });
});
