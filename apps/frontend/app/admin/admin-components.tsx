'use client';

import { type FormEvent } from 'react';
import { Button, Card, CardContent, ErrorState, StatusBadge as SharedStatusBadge } from '../../design-system';

export function MetricCard({ label, value }: Readonly<{ label: string; value: number | string }>) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ value }: Readonly<{ value: string }>) {
  return <SharedStatusBadge value={value} />;
}

export function AdminError({ message = 'Admin access required.' }: Readonly<{ message?: string }>) {
  return <ErrorState title="Admin access required" description={message} />;
}

export function FilterForm({
  children,
  onSubmit,
}: Readonly<{
  children: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <form className="mb-4 flex flex-wrap gap-3 rounded-md border bg-card p-4" onSubmit={onSubmit}>
      {children}
      <Button type="submit">
        Apply
      </Button>
    </form>
  );
}

export function TextInput(props: Readonly<React.InputHTMLAttributes<HTMLInputElement>>) {
  return <input {...props} className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />;
}

export function SelectInput(props: Readonly<React.SelectHTMLAttributes<HTMLSelectElement>>) {
  return <select {...props} className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />;
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}
