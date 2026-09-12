import { describe, expect, it } from 'vitest';
import { getRoleLandingPage, navigationForRoles } from './navigation';

describe('navigationForRoles', () => {
  it('returns student navigation for students', () => {
    expect(navigationForRoles(['STUDENT']).map((item) => item.href)).toEqual([
      '/courses',
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

describe('getRoleLandingPage', () => {
  it('redirects student to /courses', () => {
    expect(getRoleLandingPage(['STUDENT'])).toBe('/courses');
  });

  it('redirects instructor to /instructor/courses', () => {
    expect(getRoleLandingPage(['INSTRUCTOR'])).toBe('/instructor/courses');
  });

  it('redirects admin to /admin', () => {
    expect(getRoleLandingPage(['ADMIN'])).toBe('/admin');
  });

  it('prioritizes ADMIN over INSTRUCTOR and STUDENT', () => {
    expect(getRoleLandingPage(['STUDENT', 'INSTRUCTOR', 'ADMIN'])).toBe('/admin');
    expect(getRoleLandingPage(['STUDENT', 'INSTRUCTOR'])).toBe('/instructor/courses');
  });
});
