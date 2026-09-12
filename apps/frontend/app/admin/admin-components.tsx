'use client';

import { type FormEvent } from 'react';
import { Card, CardContent } from '../../design-system/components/card';
import { Button } from '../../design-system/components/button';
import { StatusBadge as SharedStatusBadge } from '../../design-system/components/status-badge';
import { ErrorState } from '../../design-system/components/error-state';

export function MetricCard({
  label,
  value,
  description,
  icon,
}: Readonly<{
  label: string;
  value: number | string;
  description?: string | undefined;
  icon?: React.ReactNode | undefined;
}>) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {icon ? <div className="text-muted-foreground/60">{icon}</div> : null}
        </div>
        <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ value }: Readonly<{ value: string }>) {
  const normalized = value.toUpperCase();
  let tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' = 'neutral';

  if (['ACTIVE', 'PUBLISHED', 'COMPLETED', 'PASSED', 'READY', 'OK', 'HEALTHY'].includes(normalized)) {
    tone = 'success';
  } else if (['DRAFT', 'QUEUED', 'PROCESSING', 'SUSPENDED', 'DEGRADED', 'ARCHIVED'].includes(normalized)) {
    tone = 'warning';
  } else if (['FAILED', 'DISABLED', 'ERROR', 'DOWN', 'UNHEALTHY'].includes(normalized)) {
    tone = 'danger';
  } else if (['STUDENT', 'INSTRUCTOR', 'ADMIN', 'RUNNING'].includes(normalized)) {
    tone = 'info';
  }

  return <SharedStatusBadge tone={tone}>{value}</SharedStatusBadge>;
}

export function AdminError({ message = 'Admin access required or request failed.' }: Readonly<{ message?: string | undefined }>) {
  return (
    <div className="py-12">
      <ErrorState title="Admin Access Issue" message={message} />
    </div>
  );
}

export function FilterForm({
  children,
  onSubmit,
}: Readonly<{
  children: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <form
      className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 shadow-2xs"
      onSubmit={onSubmit}
    >
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
      <Button type="submit" size="sm">
        Apply Filter
      </Button>
    </form>
  );
}

export function TextInput(props: Readonly<React.InputHTMLAttributes<HTMLInputElement>>) {
  return (
    <input
      {...props}
      className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground shadow-2xs transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

export function SelectInput(props: Readonly<React.SelectHTMLAttributes<HTMLSelectElement>>) {
  return (
    <select
      {...props}
      className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground shadow-2xs transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

export function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
