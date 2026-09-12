import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: Readonly<{
  title: string;
  description?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  actions?: ReactNode;
}>) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <div key={idx} className="flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className="hover:text-foreground transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'font-medium text-foreground' : ''}>{crumb.label}</span>
                  )}
                </div>
              );
            })}
          </nav>
        )}
        <h1 className="text-3xl font-bold leading-tight tracking-normal text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
