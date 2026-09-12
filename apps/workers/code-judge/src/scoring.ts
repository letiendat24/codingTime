export function calculateScore(input: {
  readonly scoringMode: 'ALL_OR_NOTHING' | 'WEIGHTED';
  readonly passScore: number;
  readonly testWeights: readonly number[];
  readonly passedWeights: readonly number[];
}) {
  const totalWeight = input.testWeights.reduce((sum, weight) => sum + weight, 0);
  const passedWeight = input.passedWeights.reduce((sum, weight) => sum + weight, 0);
  const rawScore = input.scoringMode === 'ALL_OR_NOTHING'
    ? (totalWeight > 0 && passedWeight === totalWeight ? 100 : 0)
    : (totalWeight > 0 ? (passedWeight / totalWeight) * 100 : 0);
  const score = Math.round(rawScore * 100) / 100;

  return {
    score,
    passed: score >= input.passScore,
  };
}
