import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from './card';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly message?: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, message, icon, action }: EmptyStateProps) {
  const desc = description ?? message;
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
        {desc ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{desc}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
