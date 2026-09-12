import type { ProjectRubricResultStatus } from '@prisma/client';

export function calculateProjectScore(input: {
  readonly passScore: number;
  readonly criteria: readonly { readonly id: string; readonly weight: number; readonly required: boolean }[];
  readonly results: readonly { readonly criterionId: string | null; readonly status: ProjectRubricResultStatus | string; readonly scoreEarned: number }[];
}) {
  const totalWeight = input.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const earnedWeight = input.results.reduce((sum, result) => sum + result.scoreEarned, 0);
  const score = totalWeight <= 0 ? 0 : Math.round((earnedWeight / totalWeight) * 10_000) / 100;
  const failedRequired = input.criteria.some((criterion) => {
    if (!criterion.required) {
      return false;
    }

    const result = input.results.find((item) => item.criterionId === criterion.id);
    return !result || result.status !== 'PASSED';
  });

  return {
    score,
    passed: score >= input.passScore && !failedRequired,
  };
}
