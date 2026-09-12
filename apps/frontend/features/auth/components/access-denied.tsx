'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent } from '../../../design-system';
import { useI18n } from '../../../providers/i18n-provider';

export function AccessDenied({ roleLandingPage = '/courses' }: { readonly roleLandingPage?: string }) {
  const { t } = useI18n();

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <Card className="max-w-md w-full border-destructive/20 text-center">
        <CardContent className="py-10 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('common.accessDenied')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('common.forbidden')}</p>
          <div className="mt-6">
            <Link href={roleLandingPage}>
              <Button>{t('common.backToSafety')}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
