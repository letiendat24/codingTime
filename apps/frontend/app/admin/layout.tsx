import Link from 'next/link';

const adminLinks = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/instructors', label: 'Instructors' },
  { href: '/admin/courses', label: 'Courses' },
  { href: '/admin/enrollments', label: 'Enrollments' },
  { href: '/admin/operations', label: 'Operations' },
  { href: '/admin/audit-logs', label: 'Audit Logs' },
];

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {adminLinks.map((link) => (
            <Link key={link.href} className="rounded-md border px-3 py-2 text-sm hover:bg-muted" href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </main>
  );
}
