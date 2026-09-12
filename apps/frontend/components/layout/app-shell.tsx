'use client';

import {
  Activity,
  BookOpen,
  CheckSquare,
  FileCode,
  FileText,
  Gauge,
  GraduationCap,
  History,
  Layers,
  LogOut,
  Menu,
  Moon,
  Shield,
  Sun,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Dropdown, IconButton } from '../../design-system';
import { useCurrentUser } from '../../hooks/use-current-user';
import { clearAccessToken, requestJson } from '../../lib/api';
import { getRoleLandingPage } from '../../lib/navigation';
import { useI18n } from '../../providers/i18n-provider';
import { useTheme, type ThemeMode } from '../../providers/theme-provider';
import { cn } from '../../lib/utils';
import { NotificationBell } from '../notification-bell';

interface NavigationItem {
  readonly href: string;
  readonly label: string;
  readonly icon: ReactNode;
}

interface NavigationGroup {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

const publicRoutes = new Set(['/login', '/register']);

function buildNavigationGroups(roles: readonly string[], t: (key: string) => string): readonly NavigationGroup[] {
  const roleSet = new Set(roles);
  const groups: NavigationGroup[] = [];

  if (roleSet.has('STUDENT')) {
    groups.push(
      {
        label: t('common.learn'),
        items: [
          { href: '/courses', label: t('common.courses'), icon: <BookOpen className="h-4 w-4" /> },
          { href: '/my-courses', label: t('common.myCourses'), icon: <GraduationCap className="h-4 w-4" /> },
          { href: '/learning-history', label: t('common.history'), icon: <History className="h-4 w-4" /> },
        ],
      },
      {
        label: t('common.practice'),
        items: [
          { href: '/practice', label: t('common.practice'), icon: <Gauge className="h-4 w-4" /> },
        ],
      },
    );
  }

  if (roleSet.has('INSTRUCTOR')) {
    groups.push({
      label: t('common.teaching'),
      items: [
        { href: '/instructor/courses', label: t('instructor.courses'), icon: <BookOpen className="h-4 w-4" /> },
        { href: '/instructor/practice', label: t('instructor.practice'), icon: <FileCode className="h-4 w-4" /> },
      ],
    });
  }

  if (roleSet.has('ADMIN')) {
    groups.push({
      label: t('common.platform'),
      items: [
        { href: '/admin', label: t('admin.dashboard'), icon: <Shield className="h-4 w-4" /> },
        { href: '/admin/users', label: t('admin.users'), icon: <Users className="h-4 w-4" /> },
        { href: '/admin/instructors', label: t('admin.instructors'), icon: <GraduationCap className="h-4 w-4" /> },
        { href: '/admin/courses', label: t('admin.courses'), icon: <Layers className="h-4 w-4" /> },
        { href: '/admin/enrollments', label: t('admin.enrollments'), icon: <CheckSquare className="h-4 w-4" /> },
        { href: '/admin/operations', label: t('admin.operations'), icon: <Activity className="h-4 w-4" /> },
        { href: '/admin/audit-logs', label: t('admin.auditLogs'), icon: <FileText className="h-4 w-4" /> },
      ],
    });
  }

  return groups;
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useCurrentUser();
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();

  const user = me.data?.user;
  const isAuthenticated = Boolean(user);
  const groups = isAuthenticated ? buildNavigationGroups(user?.roles ?? [], t) : [];
  const showSidebar = isAuthenticated && !publicRoutes.has(pathname);
  const homeHref = isAuthenticated ? getRoleLandingPage(user?.roles ?? []) : '/';

  async function handleLogout() {
    try {
      await requestJson('/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } catch {
      // ignore network errors on logout
    }
    clearAccessToken();
    queryClient.clear();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {showSidebar ? (
            <IconButton className="lg:hidden" label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </IconButton>
          ) : null}

          <Link className="flex items-center gap-2 font-bold tracking-tight text-foreground hover:opacity-90" href={homeHref}>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-black text-sm">
              CS
            </div>
            <span>CodeSync</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {isAuthenticated ? <NotificationBell /> : null}

            <select
              aria-label={t('common.language')}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={locale}
              onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'vi')}
            >
              <option value="vi">{t('common.vietnamese')}</option>
              <option value="en">{t('common.english')}</option>
            </select>

            <ThemeSelect value={theme} onChange={setTheme} />

            {isAuthenticated && user ? (
              <Dropdown
                trigger={
                  <button
                    type="button"
                    className="flex h-8 items-center gap-2 rounded-full border border-border bg-muted/60 pl-2 pr-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <UserIcon className="h-3 w-3" />
                    </div>
                    <span className="max-w-[100px] truncate hidden sm:inline">{user.displayName}</span>
                  </button>
                }
                items={[
                  {
                    label: (
                      <div className="py-1">
                        <p className="font-semibold">{user.displayName}</p>
                        <p className="text-[11px] text-muted-foreground">{user.email}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role} tone="info">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    label: t('common.notifications'),
                    icon: <Activity className="h-3.5 w-3.5" />,
                    onClick: () => router.push('/notifications'),
                  },
                  {
                    label: t('common.logout'),
                    icon: <LogOut className="h-3.5 w-3.5" />,
                    variant: 'danger',
                    onClick: handleLogout,
                  },
                ]}
              />
            ) : !publicRoutes.has(pathname) ? (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => router.push('/login')}>
                  {t('common.signIn')}
                </Button>
                <Button size="sm" onClick={() => router.push('/register')}>
                  {t('common.signUp')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className={cn('flex-1 min-h-[calc(100vh-3.5rem)]', showSidebar ? 'lg:grid lg:grid-cols-[240px_minmax(0,1fr)]' : '')}>
        {showSidebar ? (
          <>
            <aside className="hidden border-r border-border bg-card lg:block">
              <Sidebar groups={groups} pathname={pathname} />
            </aside>
            {mobileOpen ? (
              <div className="fixed inset-0 z-50 lg:hidden">
                <button
                  aria-label="Close navigation backdrop"
                  className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                  type="button"
                  onClick={() => setMobileOpen(false)}
                />
                <aside className="relative h-full w-72 max-w-[85vw] border-r border-border bg-card shadow-xl">
                  <div className="flex h-14 items-center justify-between border-b border-border px-4">
                    <div className="flex items-center gap-2 font-bold">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs text-primary-foreground">
                        CS
                      </div>
                      <span>CodeSync</span>
                    </div>
                    <IconButton label="Close navigation" onClick={() => setMobileOpen(false)}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <Sidebar groups={groups} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                </aside>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

function Sidebar({
  groups,
  pathname,
  onNavigate,
}: Readonly<{
  groups: readonly NavigationGroup[];
  pathname: string;
  onNavigate?: () => void;
}>) {
  return (
    <nav className="space-y-6 p-4">
      {groups.map((group) => (
        <section key={group.label}>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active =
                item.href === '/courses'
                  ? pathname === '/courses' || (pathname.startsWith('/courses/') && !pathname.includes('/learn'))
                  : item.href === '/admin'
                  ? pathname === '/admin'
                  : item.href === '/instructor/courses'
                  ? pathname.startsWith('/instructor/courses')
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              const linkProps = onNavigate ? { onClick: onNavigate } : {};

              return (
                <Link
                  key={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active
                      ? 'bg-muted text-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                  href={item.href}
                  {...linkProps}
                >
                  <span className={cn(active ? 'text-primary' : 'text-muted-foreground')}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function ThemeSelect({ value, onChange }: Readonly<{ value: ThemeMode; onChange: (theme: ThemeMode) => void }>) {
  const { t } = useI18n();

  return (
    <label className="inline-flex items-center gap-1">
      {value === 'dark' ? <Moon className="h-3.5 w-3.5 text-muted-foreground" /> : <Sun className="h-3.5 w-3.5 text-muted-foreground" />}
      <select
        aria-label={t('common.theme')}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        value={value}
        onChange={(event) => onChange(event.target.value as ThemeMode)}
      >
        <option value="light">{t('common.light')}</option>
        <option value="dark">{t('common.dark')}</option>
        <option value="system">{t('common.system')}</option>
      </select>
    </label>
  );
}
