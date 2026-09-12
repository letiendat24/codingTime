import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TabItem<T extends string = string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly badge?: ReactNode;
}

export interface TabsProps<T extends string = string> {
  readonly items: readonly TabItem<T>[];
  readonly activeTab: T;
  readonly onTabChange: (id: T) => void;
  readonly className?: string;
  readonly variant?: 'line' | 'pill';
}

export function Tabs<T extends string = string>({
  items,
  activeTab,
  onTabChange,
  className,
  variant = 'line',
}: TabsProps<T>) {
  if (variant === 'pill') {
    return (
      <div className={cn('inline-flex rounded-lg bg-muted p-1 text-muted-foreground', className)}>
        {items.map((item) => {
          const active = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? <span className="ml-1">{item.badge}</span> : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('border-b border-border', className)}>
      <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
        {items.map((item) => {
          const active = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                'group inline-flex items-center gap-2 whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors focus-visible:outline-none',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? <span className="ml-1">{item.badge}</span> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
