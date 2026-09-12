'use client';

import { BookOpen, Bell, Gauge, GraduationCap, History, LayoutDashboard, Menu, Moon, Shield, Sun, UserCog, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { IconButton } from '../../design-system';
import { useCurrentUser } from '../../hooks/use-current-user';
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

function navigationGroups(roles: readonly string[], t: (key: string) => string): readonly NavigationGroup[] {
  const roleSet = new Set(roles);
  const groups: NavigationGroup[] = [];

  if (roleSet.has('STUDENT')) {
    groups.push({
      label: t('common.practice'),
      items: [
        { href: '/dashboard', label: t('common.dashboard'), icon: <LayoutDashboard className="h-4 w-4" /> },
        { href: '/courses', label: t('common.courses'), icon: <BookOpen className="h-4 w-4" /> },
        { href: '/my-courses', label: t('common.myCourses'), icon: <GraduationCap className="h-4 w-4" /> },
        { href: '/practice', label: t('common.practice'), icon: <Gauge className="h-4 w-4" /> },
        { href: '/learning-history', label: t('common.history'), icon: <History className="h-4 w-4" /> },
      ],
    });
  }

  if (roleSet.has('INSTRUCTOR')) {
    groups.push({
      label: t('common.instructor'),
      items: [
        { href: '/instructor/courses', label: t('instructor.courses'), icon: <BookOpen className="h-4 w-4" /> },
        { href: '/instructor/practice', label: t('instructor.practice'), icon: <Gauge className="h-4 w-4" /> },
      ],
    });
  }

  if (roleSet.has('ADMIN')) {
    groups.push({
      label: t('common.admin'),
      items: [
        { href: '/admin', label: t('admin.dashboard'), icon: <Shield className="h-4 w-4" /> },
        { href: '/admin/users', label: t('admin.users'), icon: <UserCog className="h-4 w-4" /> },
        { href: '/admin/operations', label: t('admin.operations'), icon: <Bell className="h-4 w-4" /> },
      ],
    });
  }

  return groups;
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useCurrentUser();
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const groups = navigationGroups(me.data?.user.roles ?? [], t);
  const showSidebar = groups.length > 0 && !publicRoutes.has(pathname);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {showSidebar ? (
            <IconButton className="lg:hidden" label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </IconButton>
          ) : null}
          <Link className="font-semibold tracking-normal" href={showSidebar ? '/dashboard' : '/'}>
            CodeSync
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {showSidebar ? <NotificationBell /> : null}
            <select
              aria-label={t('common.language')}
              className="h-9 rounded-md border bg-card px-2 text-xs"
              value={locale}
              onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'vi')}
            >
              <option value="vi">{t('common.vietnamese')}</option>
              <option value="en">{t('common.english')}</option>
            </select>
            <ThemeSelect value={theme} onChange={setTheme} />
          </div>
        </div>
      </header>

      <div className={cn('min-h-[calc(100vh-3.5rem)]', showSidebar ? 'lg:grid lg:grid-cols-[260px_minmax(0,1fr)]' : '')}>
        {showSidebar ? (
          <>
            <aside className="hidden border-r bg-card lg:block">
              <Sidebar groups={groups} pathname={pathname} />
            </aside>
            {mobileOpen ? (
              <div className="fixed inset-0 z-50 lg:hidden">
                <button aria-label="Close navigation backdrop" className="absolute inset-0 bg-background/80" type="button" onClick={() => setMobileOpen(false)} />
                <aside className="relative h-full w-80 max-w-[88vw] border-r bg-card">
                  <div className="flex h-14 items-center justify-between border-b px-4">
                    <span className="font-semibold">CodeSync</span>
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

function Sidebar({ groups, pathname, onNavigate }: Readonly<{ groups: readonly NavigationGroup[]; pathname: string; onNavigate?: () => void }>) {
  return (
    <nav className="space-y-6 p-4">
      {groups.map((group) => (
        <section key={group.label}>
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              const linkProps = onNavigate ? { onClick: onNavigate } : {};

              return (
                <Link
                  key={item.href}
                  className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}
                  href={item.href}
                  {...linkProps}
                >
                  {item.icon}
                  {item.label}
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
      {value === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
      <select
        aria-label={t('common.theme')}
        className="h-9 rounded-md border bg-card px-2 text-xs"
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
