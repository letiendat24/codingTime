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
    // Fall back to the legacy normalized stdout comparator for direct-output problems.
  }

  return normalizeOutput(actual) === normalizeOutput(expected);
}
