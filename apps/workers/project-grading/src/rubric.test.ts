import { describe, expect, it } from 'vitest';
import { calculateScore } from './rubric';

describe('project rubric scoring', () => {
  it('normalizes weighted criteria to 0-100', () => {
    expect(calculateScore({
      passScore: 70,
      criteria: [
        { id: 'a', title: 'A', description: null, type: 'AUTO', autoCheckType: 'FILE_EXISTS', config: null, weight: 20, required: false, position: 1 },
        { id: 'b', title: 'B', description: null, type: 'AUTO', autoCheckType: 'FILE_EXISTS', config: null, weight: 80, required: false, position: 2 },
      ],
      results: [
        { criterionId: 'a', title: 'A', status: 'PASSED', scoreEarned: 20, maxScore: 20, feedback: null, details: null },
        { criterionId: 'b', title: 'B', status: 'FAILED', scoreEarned: 0, maxScore: 80, feedback: null, details: null },
      ],
    })).toEqual({ score: 20, passed: false });
  });

  it('prevents passing when a required criterion fails', () => {
    expect(calculateScore({
      passScore: 50,
      criteria: [
        { id: 'required', title: 'Required', description: null, type: 'AUTO', autoCheckType: 'FILE_EXISTS', config: null, weight: 10, required: true, position: 1 },
        { id: 'bonus', title: 'Bonus', description: null, type: 'AUTO', autoCheckType: 'FILE_EXISTS', config: null, weight: 90, required: false, position: 2 },
      ],
      results: [
        { criterionId: 'required', title: 'Required', status: 'FAILED', scoreEarned: 0, maxScore: 10, feedback: null, details: null },
        { criterionId: 'bonus', title: 'Bonus', status: 'PASSED', scoreEarned: 90, maxScore: 90, feedback: null, details: null },
      ],
    })).toEqual({ score: 90, passed: false });
  });
});
