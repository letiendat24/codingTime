'use client';

import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  readonly id: string;
  readonly title: string;
  readonly message?: string | undefined;
  readonly tone: ToastTone;
  readonly durationMs?: number | undefined;
}

export interface ToastProps {
  readonly toast: ToastItem;
  readonly onDismiss: (id: string) => void;
}

const toneStyles: Record<ToastTone, { container: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: {
    container: 'border-emerald-500/30 bg-emerald-500/10 text-foreground dark:border-emerald-500/40 dark:bg-emerald-950/80',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  error: {
    container: 'border-destructive/30 bg-destructive/10 text-foreground dark:border-destructive/40 dark:bg-rose-950/80',
    icon: AlertCircle,
    iconColor: 'text-destructive dark:text-rose-400',
  },
  warning: {
    container: 'border-amber-500/30 bg-amber-500/10 text-foreground dark:border-amber-500/40 dark:bg-amber-950/80',
    icon: AlertTriangle,
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    container: 'border-sky-500/30 bg-sky-500/10 text-foreground dark:border-sky-500/40 dark:bg-sky-950/80',
    icon: Info,
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
};

export function Toast({ toast, onDismiss }: ToastProps) {
  const { container, icon: Icon, iconColor } = toneStyles[toast.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-top-4 sm:slide-in-from-bottom-4',
        container,
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', iconColor)} />
      <div className="flex-1 space-y-1 overflow-hidden">
        <h4 className="text-sm font-semibold leading-tight text-foreground">{toast.title}</h4>
        {toast.message && (
          <p className="text-xs leading-relaxed text-muted-foreground break-words">{toast.message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 -mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
