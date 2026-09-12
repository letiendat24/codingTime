export interface NavigationItem {
  readonly href: string;
  readonly label: string;
}

export function navigationForRoles(roles: readonly string[]): readonly NavigationItem[] {
  const roleSet = new Set(roles);
  const items: NavigationItem[] = [];

  if (roleSet.has('STUDENT')) {
    items.push(
      { href: '/dashboard', label: 'Dashboard' },
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
