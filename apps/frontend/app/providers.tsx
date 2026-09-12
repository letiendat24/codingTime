'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { I18nProvider } from '../providers/i18n-provider';
import { ThemeProvider } from '../providers/theme-provider';
import { ToastProvider, toast } from '../providers/toast-provider';

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            // If mutation explicitly handles onError or disables global toast, skip
            if (mutation.options.onError) return;
            const message = error instanceof Error ? error.message : 'An unexpected error occurred';
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
