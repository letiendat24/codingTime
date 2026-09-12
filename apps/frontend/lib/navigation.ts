export interface NavigationItem {
  readonly href: string;
  readonly label: string;
}

export function getRoleLandingPage(roles: readonly string[]): string {
  const roleSet = new Set(roles);
  if (roleSet.has('ADMIN')) {
    return '/admin';
  }
  if (roleSet.has('INSTRUCTOR')) {
    return '/instructor/courses';
  }
  if (roleSet.has('STUDENT')) {
    return '/courses';
  }
  return '/courses';
}

export function navigationForRoles(roles: readonly string[]): readonly NavigationItem[] {
  const roleSet = new Set(roles);
  const items: NavigationItem[] = [];

  if (roleSet.has('STUDENT')) {
    items.push(
      { href: '/courses', label: 'Courses' },
      { href: '/my-courses', label: 'My Courses' },
      { href: '/practice', label: 'Practice' },
      { href: '/learning-history', label: 'Learning History' },
    );
  }

  if (roleSet.has('INSTRUCTOR')) {
    items.push(
      { href: '/instructor/courses', label: 'Instructor Courses' },
      { href: '/instructor/practice', label: 'Instructor Practice' },
    );
  }

  if (roleSet.has('ADMIN')) {
    items.push({ href: '/admin', label: 'Admin' });
  }

  return items;
}
