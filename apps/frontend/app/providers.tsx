'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { I18nProvider } from '../providers/i18n-provider';
import { ThemeProvider } from '../providers/theme-provider';
import { ToastProvider, toast } from '../providers/toast-provider';

const recentMutationErrorToasts = new Map<string, number>();
const duplicateToastWindowMs = 5_000;

function shouldShowGlobalMutationToast(key: string) {
  const now = Date.now();
  const lastShownAt = recentMutationErrorToasts.get(key);

  if (lastShownAt && now - lastShownAt < duplicateToastWindowMs) {
    return false;
  }

  recentMutationErrorToasts.set(key, now);

  for (const [storedKey, storedAt] of recentMutationErrorToasts.entries()) {
    if (now - storedAt > duplicateToastWindowMs) {
      recentMutationErrorToasts.delete(storedKey);
    }
  }

  return true;
}

function hasSuppressGlobalToastMeta(meta: unknown) {
  return typeof meta === 'object' && meta !== null && 'suppressGlobalToast' in meta
    ? Boolean((meta as { readonly suppressGlobalToast?: unknown }).suppressGlobalToast)
    : false;
}

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            // If mutation explicitly handles onError or disables global toast, skip
            if (mutation.options.onError) return;
            if (hasSuppressGlobalToastMeta(mutation.options.meta)) return;
            const message = error instanceof Error ? error.message : 'An unexpected error occurred';
            const key = `${mutation.options.mutationKey?.map(String).join(':') ?? 'mutation'}:${message}`;

            if (!shouldShowGlobalMutationToast(key)) return;

            toast.error('Action failed', message);
          },
        }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
