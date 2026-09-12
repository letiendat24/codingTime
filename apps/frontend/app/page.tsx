'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Code, Cpu, Terminal, Video } from 'lucide-react';
import { Button, Card, CardContent } from '../design-system';
import { useCurrentUser } from '../hooks/use-current-user';
import { getRoleLandingPage } from '../lib/navigation';
import { useI18n } from '../providers/i18n-provider';

export default function HomePage() {
  const router = useRouter();
  const me = useCurrentUser();
  const { t } = useI18n();

  useEffect(() => {
    if (me.data?.user) {
      router.replace(getRoleLandingPage(me.data.user.roles));
    }
  }, [me.data?.user, router]);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center bg-background px-4 py-16">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Next-Generation Developer Learning Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-foreground">
          Master Code Through{' '}
          <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
            Interactive Sync
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
          Learn directly alongside industry experts. Watch full-length technical videos synchronized in real-time with
          instructor code snapshots, automated in-browser sandboxes, and automated judging.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link href="/courses">
            <Button size="lg" className="shadow-md">
              <span>{t('courses.exploreCourses')}</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
          <Link href="/practice">
            <Button size="lg" variant="secondary">
              <Terminal className="h-4 w-4 mr-1.5" />
              <span>{t('common.practice')}</span>
            </Button>
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 pt-12 text-left">
          <Card className="hover:border-primary/40 transition-colors">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Video className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">Video-Code Sync</h3>
              <p className="text-xs text-muted-foreground leading-normal">
                Video player synchronized with instructor code timeline. Seek to any snapshot instantly.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/40 transition-colors">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Code className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">Integrated Workspace</h3>
              <p className="text-xs text-muted-foreground leading-normal">
                Full in-browser Monaco IDE with run execution, automated judge checkpoints, and diff comparisons.
              </p>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/40 transition-colors">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Cpu className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-sm text-foreground">Automated Grading</h3>
              <p className="text-xs text-muted-foreground leading-normal">
                Practice algorithm challenges and submit real GitHub project repositories for automated evaluation.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
