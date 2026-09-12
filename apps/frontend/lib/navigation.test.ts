import { describe, expect, it } from 'vitest';
import { navigationForRoles } from './navigation';

describe('navigationForRoles', () => {
  it('returns student navigation for students', () => {
    expect(navigationForRoles(['STUDENT']).map((item) => item.href)).toEqual([
      '/dashboard',
      '/my-courses',
      '/practice',
      '/learning-history',
    ]);
  });

  it('keeps multi-role navigation visible', () => {
    expect(navigationForRoles(['ADMIN', 'INSTRUCTOR']).map((item) => item.href)).toEqual([
      '/instructor/courses',
      '/instructor/practice',
      '/admin',
    ]);
  });
});
