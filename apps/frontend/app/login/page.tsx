'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageSkeleton } from '../../design-system';
import { useCurrentUser } from '../../hooks/use-current-user';
import { requestJson, storeAccessToken } from '../../lib/api';
import { getRoleLandingPage } from '../../lib/navigation';
import { queryKeys } from '../../lib/query/keys';
import { useI18n } from '../../providers/i18n-provider';

interface AuthResponse {
  readonly accessToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly roles: readonly string[];
  };
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><PageSkeleton /></main>}>
      <LoginFormContent />
    </Suspense>
  );
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const me = useCurrentUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectParam = searchParams.get('redirect');

  useEffect(() => {
    if (me.data?.user) {
      const destination = redirectParam || getRoleLandingPage(me.data.user.roles);
      router.replace(destination);
    }
  }, [me.data?.user, redirectParam, router]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      const body = await requestJson<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
        skipAuthRefresh: true,
      });
      storeAccessToken(body.accessToken);
      return body;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      const destination = redirectParam || getRoleLandingPage(data.user.roles);
      router.push(destination);
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || t('common.error'));
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    loginMutation.mutate();
  }

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            CS
          </div>
          <CardTitle className="text-xl font-bold">{t('auth.login')}</CardTitle>
          <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            {errorMessage ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="login-email">
                {t('auth.email')}
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="login-password">
                {t('auth.password')}
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <Button
              className="w-full mt-2"
              type="submit"
              isLoading={loginMutation.isPending}
              disabled={loginMutation.isPending || !email.trim() || !password}
            >
              {loginMutation.isPending ? t('auth.signingIn') : t('auth.login')}
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center">
            <Link
              href={redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : '/register'}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {t('auth.noAccount')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
