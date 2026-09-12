'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCurrentUser } from '../../../hooks/use-current-user';
import { getRoleLandingPage } from '../../../lib/navigation';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

export interface UseAuthGuardOptions {
  readonly requiredRole?: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' | undefined;
  readonly redirectToLogin?: boolean | undefined;
}

export function useAuthGuard(options: UseAuthGuardOptions = {}) {
  const { requiredRole, redirectToLogin = true } = options;
  const router = useRouter();
  const pathname = usePathname();
  const me = useCurrentUser();

  const user = me.data?.user;
  const isLoading = me.isLoading || me.isFetching;

  let authState: AuthState = 'loading';
  if (user) {
    authState = 'authenticated';
  } else if (!isLoading) {
    authState = 'unauthenticated';
  }

  const isAuthenticated = authState === 'authenticated';
  const hasRequiredRole = requiredRole
    ? user?.roles.includes(requiredRole) ?? false
    : true;

  useEffect(() => {
    // Strictly do not redirect while auth state is loading/bootstrapping
    if (authState === 'loading') return;

    if (authState === 'unauthenticated' && redirectToLogin) {
      const redirectUrl = pathname ? `/login?redirect=${encodeURIComponent(pathname)}` : '/login';
      router.replace(redirectUrl);
    }
  }, [authState, redirectToLogin, pathname, router]);

  return {
    user,
    isLoading: authState === 'loading',
    isAuthenticated,
    isAuthorized: isAuthenticated && hasRequiredRole,
    authState,
    roleLandingPage: user ? getRoleLandingPage(user.roles) : '/courses',
  };
}
