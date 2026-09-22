import { ScoringMode } from '@prisma/client';

export function normalizeOutput(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  return value;
}

export function outputsMatch(actual: string, expected: string) {
  try {
    const actualJson = JSON.parse(normalizeOutput(actual));
    const expectedJson = JSON.parse(normalizeOutput(expected));
    return JSON.stringify(normalizeJson(actualJson)) === JSON.stringify(normalizeJson(expectedJson));
  } catch {
    // Fall back to legacy normalized stdout comparison.
  }

  return normalizeOutput(actual) === normalizeOutput(expected);
}

export function calculateScore(input: {
  readonly scoringMode: ScoringMode;
  readonly passScore: number;
  readonly testWeights: readonly number[];
  readonly passedWeights: readonly number[];
}) {
  const totalWeight = input.testWeights.reduce((sum, weight) => sum + weight, 0);
  const passedWeight = input.passedWeights.reduce((sum, weight) => sum + weight, 0);
  const rawScore = input.scoringMode === ScoringMode.ALL_OR_NOTHING
    ? (passedWeight === totalWeight && totalWeight > 0 ? 100 : 0)
    : (totalWeight > 0 ? (passedWeight / totalWeight) * 100 : 0);
  const score = Math.round(rawScore * 100) / 100;

  return {
    score,
    passed: score >= input.passScore,
  };
}
