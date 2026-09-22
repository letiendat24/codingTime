import { describe, expect, it } from 'vitest';
import { outputsMatch } from './comparator';

describe('judge output comparator', () => {
  it('matches exact output', () => {
    expect(outputsMatch('42', '42')).toBe(true);
  });

  it('normalizes line endings', () => {
    expect(outputsMatch('a\r\nb\r\n', 'a\nb\n')).toBe(true);
  });

  it('normalizes trailing whitespace and final newlines', () => {
    expect(outputsMatch('a  \n\n', 'a')).toBe(true);
  });

  it('does not normalize meaningful internal whitespace', () => {
    expect(outputsMatch('hello  world', 'hello world')).toBe(false);
  });

  it('compares structured JSON values for function-contract returns', () => {
    expect(outputsMatch('[0,1]', '[0, 1]')).toBe(true);
    expect(outputsMatch('{"b":2,"a":1}', '{"a":1,"b":2}')).toBe(true);
  });

  it('keeps array order significant for structured JSON values', () => {
    expect(outputsMatch('[1,0]', '[0,1]')).toBe(false);
  });
});
