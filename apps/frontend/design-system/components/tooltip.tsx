import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TooltipProps {
  readonly content: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <div className={cn('group relative inline-flex', className)}>
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:bg-slate-100 dark:text-slate-900 whitespace-nowrap z-50 shadow-md">
        {content}
      </span>
    </div>
  );
}
