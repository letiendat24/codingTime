'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  UserCheck,
  Activity,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '../../design-system/components/page-header';

const adminLinks = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/instructors', label: 'Instructors', icon: GraduationCap },
  { href: '/admin/courses', label: 'Courses', icon: BookOpen },
  { href: '/admin/enrollments', label: 'Enrollments', icon: UserCheck },
  { href: '/admin/operations', label: 'Operations', icon: Activity },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldAlert },
];

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <PageHeader
          title="Admin Control Center"
          description="System-wide management, operations telemetry, user governance, and security audit logs."
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: adminLinks.find((l) => (l.exact ? pathname === l.href : pathname.startsWith(l.href)))?.label ?? 'Dashboard' },
          ]}
        />

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b pb-px scrollbar-none">
          {adminLinks.map((link) => {
            const Icon = link.icon;
            const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
