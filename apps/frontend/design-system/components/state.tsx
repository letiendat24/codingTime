import { AlertCircle, Inbox } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent } from './card';

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-lg bg-muted" />)}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return <div className="space-y-2">{Array.from({ length: rows }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-md bg-muted" />)}</div>;
}

export function EmptyState({ title, description, action }: Readonly<{ title: string; description?: string; action?: React.ReactNode }>) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 font-semibold">{title}</h3>
        {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ title, description, onRetry }: Readonly<{ title: string; description?: string; onRetry?: () => void }>) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
        <div>
          <h3 className="font-semibold text-destructive">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          {onRetry ? <Button className="mt-3" size="sm" variant="secondary" onClick={onRetry}>Retry</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}
