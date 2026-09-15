'use client';

import {
  Activity,
  BookOpen,
  CheckSquare,
  ChevronDown,
  FileCode,
  FileText,
  Gauge,
  GraduationCap,
  History,
  Layers,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Search,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const me = useCurrentUser();
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('codesync.sidebar.collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('codesync.sidebar.collapsed', String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

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
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground select-text">
      {/* Spacious, Highly Functional Topbar */}
      <header className="shrink-0 h-15 sm:h-16 border-b border-border/70 bg-card/95 backdrop-blur-md z-40 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          {showSidebar ? (
            <IconButton
              className="lg:hidden"
              label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4.5 w-4.5" />
            </IconButton>
          ) : null}

          <Link
            className="flex items-center gap-2.5 font-bold tracking-tight text-foreground hover:opacity-90 transition-opacity"
            href={homeHref}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background font-black text-xs shadow-2xs">
              CS
            </div>
            <span className="text-[17px] font-bold tracking-tight">CodeSync</span>
          </Link>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {isAuthenticated ? <NotificationBell /> : null}

          <div className="relative">
            <select
              aria-label={t('common.language')}
              className="h-9 rounded-lg border border-border/80 bg-card px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all hover:bg-muted/50 hover:border-border cursor-pointer shadow-2xs"
              value={locale}
              onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'vi')}
            >
              <option value="vi">🇻🇳 Tiếng Việt</option>
              <option value="en">🇺🇸 English</option>
            </select>
          </div>

          <ThemeSelect value={theme} onChange={setTheme} />

          {isAuthenticated && user ? (
            <Dropdown
              trigger={
                <button
                  type="button"
                  className="flex h-9 items-center gap-2.5 rounded-lg border border-border/80 bg-card px-2.5 text-xs font-semibold text-foreground transition-all hover:bg-muted/50 hover:border-border cursor-pointer shadow-2xs"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background font-bold text-[11px] shadow-2xs">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-[130px] sm:max-w-[170px] truncate text-xs font-semibold">
                    {user.displayName}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-0.5" />
                </button>
              }
              items={[
                {
                  label: (
                    <div className="py-1 px-1">
                      <p className="font-semibold text-xs text-foreground">{user.displayName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} tone="neutral" className="text-[10px] py-0 px-1.5">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ),
                },
                {
                  label: t('common.practice'),
                  icon: <Gauge className="h-3.5 w-3.5" />,
                  onClick: () => router.push('/practice'),
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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => router.push('/login')} className="h-9 px-3.5 text-xs">
                {t('common.signIn')}
              </Button>
              <Button size="sm" onClick={() => router.push('/register')} className="h-9 px-4 text-xs font-semibold shadow-xs">
                {t('common.signUp')}
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Main Body Area with Independent Scrolling for Sidebar and Page */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {showSidebar ? (
          <>
            {/* Desktop Sticky / Fixed Height Sidebar */}
            <aside
              className={cn(
                'hidden lg:flex flex-col h-full shrink-0 border-r border-border/60 bg-card/40 transition-[width] duration-200 ease-in-out select-none relative',
                isCollapsed ? 'w-17' : 'w-60',
              )}
            >
              <Sidebar
                groups={groups}
                pathname={pathname}
                isCollapsed={isCollapsed}
                onToggleCollapse={toggleCollapse}
              />
            </aside>

            {/* Mobile Slide-in Drawer */}
            {mobileOpen ? (
              <div className="fixed inset-0 z-50 lg:hidden">
                <button
                  aria-label="Close navigation backdrop"
                  className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
                  type="button"
                  onClick={() => setMobileOpen(false)}
                />
                <aside className="relative h-full w-72 max-w-[85vw] border-r border-border/60 bg-card shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
                  <div className="flex h-14 items-center justify-between border-b border-border/60 px-4 shrink-0">
                    <div className="flex items-center gap-2.5 font-bold">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-xs text-background font-black">
                        CS
                      </div>
                      <span className="text-base font-bold">CodeSync</span>
                    </div>
                    <IconButton label="Close navigation" onClick={() => setMobileOpen(false)}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <Sidebar
                      groups={groups}
                      pathname={pathname}
                      isCollapsed={false}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  </div>
                </aside>
              </div>
            ) : null}
          </>
        ) : null}

        {/* Independent Scroll Container for Main Web Page */}
        <main id="main-scroll-container" className="flex-1 h-full overflow-y-auto min-w-0 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  groups,
  pathname,
  isCollapsed = false,
  onNavigate,
  onToggleCollapse,
}: Readonly<{
  groups: readonly NavigationGroup[];
  pathname: string;
  isCollapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}>) {
  const router = useRouter();
  const { t } = useI18n();
  const [quickSearch, setQuickSearch] = useState('');

  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-4">
        {/* Quick Search Bar / Quick Icon */}
        {!isCollapsed ? (
          <div className="relative">
            <input
              type="text"
              placeholder="Quick Search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && quickSearch.trim()) {
                  router.push(`/courses?search=${encodeURIComponent(quickSearch.trim())}`);
                  onNavigate?.();
                }
              }}
              className="w-full h-9.5 rounded-lg border border-border/80 bg-card/90 pl-9 pr-8 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all shadow-2xs py-3"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-muted/90 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground font-semibold border border-border/40">
              /
            </span>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              title="Search courses"
              onClick={() => {
                router.push('/courses');
                onNavigate?.();
              }}
              className="flex h-9.5 w-9.5 items-center justify-center rounded-lg border border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shadow-2xs"
            >
              <Search className="h-4.5 w-4.5" />
            </button>
          </div>
        )}

        {/* Navigation Groups */}
        {groups.map((group) => (
          <section key={group.label} className="space-y-1">
            {!isCollapsed ? (
              <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {group.label}
              </p>
            ) : (
              <div className="mx-auto my-2 h-px w-6 bg-border/60" />
            )}

            <div className="space-y-0.5">
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

                if (isCollapsed) {
                  return (
                    <Link
                      key={item.href}
                      title={item.label}
                      className={cn(
                        'flex h-9.5 w-9.5 mx-auto items-center justify-center rounded-lg text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20',
                        active
                          ? 'bg-muted text-foreground font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                      href={item.href}
                      {...linkProps}
                    >
                      <span className={cn(active ? 'text-foreground' : 'text-muted-foreground')}>
                        {item.icon}
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20',
                      active
                        ? 'bg-muted text-foreground font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                    href={item.href}
                    {...linkProps}
                  >
                    <span className={cn(active ? 'text-foreground' : 'text-muted-foreground')}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Bottom Collapse / Expand Action */}
      {onToggleCollapse ? (
        <div className="border-t border-border/60 p-2 shrink-0">
          {!isCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" />
              <span>{t('common.collapse')}</span>
            </button>
          ) : (
            <button
              type="button"
              title={t('common.expand')}
              onClick={onToggleCollapse}
              className="flex h-9.5 w-9.5 mx-auto items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <PanelLeft className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ThemeSelect({ value, onChange }: Readonly<{ value: ThemeMode; onChange: (theme: ThemeMode) => void }>) {
  const { t } = useI18n();

  return (
    <div className="relative flex items-center">
      <div className="absolute left-2.5 pointer-events-none text-muted-foreground">
        {value === 'dark' ? (
          <Moon className="h-3.5 w-3.5" />
        ) : (
          <Sun className="h-3.5 w-3.5" />
        )}
      </div>
      <select
        aria-label={t('common.theme')}
        className="h-9 rounded-lg border border-border/80 bg-card pl-8 pr-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all hover:bg-muted/50 hover:border-border cursor-pointer shadow-2xs"
        value={value}
        onChange={(event) => onChange(event.target.value as ThemeMode)}
      >
        <option value="light">{t('common.light')}</option>
        <option value="dark">{t('common.dark')}</option>
        <option value="system">{t('common.system')}</option>
      </select>
    </div>
  );
}
