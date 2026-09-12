import type { ProjectRubricCriterionPayload, ProjectRubricResultPayload } from '@codesync/shared';

export function calculateScore(input: {
  readonly passScore: number;
  readonly criteria: readonly ProjectRubricCriterionPayload[];
  readonly results: readonly ProjectRubricResultPayload[];
}) {
  const totalWeight = input.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const earnedWeight = input.results.reduce((sum, result) => sum + result.scoreEarned, 0);
  const score = totalWeight <= 0 ? 0 : Math.round((earnedWeight / totalWeight) * 10_000) / 100;
  const requiredFailed = input.criteria.some((criterion) => {
    if (!criterion.required) {
      return false;
    }

    const result = input.results.find((item) => item.criterionId === criterion.id);
    return !result || result.status !== 'PASSED';
  });

  return {
    score,
    passed: score >= input.passScore && !requiredFailed,
  };
}
