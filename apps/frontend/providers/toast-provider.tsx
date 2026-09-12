'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Toast, type ToastItem, type ToastTone } from '../design-system/components/toast';

export interface ToastOptions {
  readonly title: string;
  readonly message?: string | undefined;
  readonly durationMs?: number | undefined;
}

export interface ToastContextValue {
  show: (tone: ToastTone, options: ToastOptions) => string;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Global dispatcher reference for non-React hook contexts (e.g. QueryClient callbacks)
let globalToastDispatcher: ((tone: ToastTone, options: ToastOptions) => string) | null = null;

export const toast = {
  show: (tone: ToastTone, options: ToastOptions) => globalToastDispatcher?.(tone, options) ?? '',
  success: (title: string, message?: string) =>
    globalToastDispatcher?.('success', { title, message }) ?? '',
  error: (title: string, message?: string) =>
    globalToastDispatcher?.('error', { title, message }) ?? '',
  warning: (title: string, message?: string) =>
    globalToastDispatcher?.('warning', { title, message }) ?? '',
  info: (title: string, message?: string) =>
    globalToastDispatcher?.('info', { title, message }) ?? '',
};

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, options: ToastOptions): string => {
      const dedupeKey = `${tone}:${options.title}:${options.message ?? ''}`;
      const now = Date.now();
      const lastShown = recentToastsRef.current.get(dedupeKey);

      // Deduplicate identical toasts dispatched within 2000ms
      if (lastShown !== undefined && now - lastShown < 2000) {
        return '';
      }

      recentToastsRef.current.set(dedupeKey, now);

      // Prune old dedupe keys
      for (const [key, timestamp] of recentToastsRef.current.entries()) {
        if (now - timestamp > 10000) {
          recentToastsRef.current.delete(key);
        }
      }

      const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const durationMs = options.durationMs ?? (tone === 'error' ? 5000 : 4000);
      const newItem: ToastItem = {
        id,
        title: options.title,
        message: options.message,
        tone,
        durationMs,
      };

      setToasts((prev) => [...prev.slice(-4), newItem]); // keep at most 5 visible toasts

      if (durationMs > 0) {
        setTimeout(() => {
          dismiss(id);
        }, durationMs);
      }

      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    globalToastDispatcher = show;
    return () => {
      globalToastDispatcher = null;
    };
  }, [show]);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (title, message) => show('success', { title, message }),
      error: (title, message) => show('error', { title, message }),
      warning: (title, message) => show('warning', { title, message }),
      info: (title, message) => show('info', { title, message }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast viewport container */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 p-2 sm:bottom-6 sm:right-6"
      >
        {toasts.map((item) => (
          <Toast key={item.id} toast={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // Return fallback bound to global toast methods
    return {
      show: (tone, opts) => toast.show(tone, opts),
      success: (title, msg) => toast.success(title, msg),
      error: (title, msg) => toast.error(title, msg),
      warning: (title, msg) => toast.warning(title, msg),
      info: (title, msg) => toast.info(title, msg),
      dismiss: () => {},
    };
  }
  return context;
}
