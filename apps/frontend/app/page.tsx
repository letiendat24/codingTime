'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Code2, Cpu, Play, Sparkles, Terminal, Video } from 'lucide-react';
import { Button } from '../design-system';
import { useCurrentUser } from '../hooks/use-current-user';
import { getRoleLandingPage } from '../lib/navigation';
import { useI18n } from '../providers/i18n-provider';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

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
    <div className="relative min-h-full overflow-hidden bg-background px-4 py-12 sm:py-20 flex flex-col items-center justify-center select-text">
      {/* Soft Ambient Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[460px] w-[640px] rounded-full bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-emerald-500/10 blur-[110px] pointer-events-none" />

      <motion.div
        className="relative z-10 max-w-5xl mx-auto text-center space-y-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Floating Top Badge */}
        <motion.div variants={itemVariants} className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-1.5 text-xs font-medium text-foreground backdrop-blur-md shadow-xs">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Next-Generation Developer Learning Platform</span>
          </div>
        </motion.div>

        {/* Hero Title & Subtitle */}
        <motion.div variants={itemVariants} className="space-y-4 max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-foreground leading-[1.15]">
            Master Engineering Through{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 bg-clip-text text-transparent">
              Interactive Code-Along
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
            Learn alongside industry experts. Watch technical lessons synchronized in real time with
            instructor code snapshots, in-browser Monaco execution sandboxes, and automated judging.
          </p>
        </motion.div>

        {/* Action Controls */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-3.5 pt-1">
          <Link href="/courses">
            <Button size="lg" className="h-11 px-6 text-sm font-semibold shadow-md group">
              <span>{t('courses.exploreCourses')}</span>
              <ArrowRight className="h-4 w-4 ml-1.5 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <Link href="/practice">
            <Button size="lg" variant="secondary" className="h-11 px-6 text-sm font-semibold">
              <Terminal className="h-4 w-4 mr-2 text-emerald-600 dark:text-emerald-400" />
              <span>{t('common.practice')}</span>
            </Button>
          </Link>
        </motion.div>

        {/* Interactive Mock Developer Workbench Preview with Motion */}
        <motion.div variants={itemVariants} className="pt-4 max-w-4xl mx-auto">
          <motion.div
            whileHover={{ y: -3 }}
            transition={{ duration: 0.2 }}
            className="relative rounded-2xl border border-border/80 bg-card/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-md overflow-hidden text-left"
          >
            {/* Window header */}
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-xs font-mono font-medium text-muted-foreground ml-2">
                  codesync-live-session.ts
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  TypeScript 5.4
                </span>
              </div>
            </div>

            {/* Code Body Mock */}
            <div className="grid sm:grid-cols-[1.5fr_1fr] divide-y sm:divide-y-0 sm:divide-x divide-border/60 bg-card">
              <div className="p-5 font-mono text-xs text-foreground/90 space-y-2 leading-relaxed">
                <p className="text-muted-foreground">// Code along with the instructor timeline in real-time</p>
                <p>
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold">async function</span>{' '}
                  <span className="text-blue-600 dark:text-blue-400 font-bold">processStream</span>(payload:{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">SessionPayload</span>) &#123;
                </p>
                <p className="pl-4">
                  <span className="text-indigo-600 dark:text-indigo-400">const</span> snapshot ={' '}
                  <span className="text-indigo-600 dark:text-indigo-400">await</span> codeEngine.
                  <span className="text-amber-600 dark:text-amber-400">syncTimestamp</span>(payload.videoTime);
                </p>
                <p className="pl-4">
                  <span className="text-indigo-600 dark:text-indigo-400">return</span> evaluateSubmission(snapshot);
                </p>
                <p>&#125;</p>
              </div>

              <div className="p-4 bg-muted/20 flex flex-col justify-between space-y-3 font-sans">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">Judge Test Suite</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 4/4 Passed
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between rounded bg-muted/60 px-2 py-1">
                      <span>✓ Type Invariants</span>
                      <span className="font-mono text-muted-foreground">12ms</span>
                    </div>
                    <div className="flex items-center justify-between rounded bg-muted/60 px-2 py-1">
                      <span>✓ Execution Sandbox</span>
                      <span className="font-mono text-muted-foreground">24ms</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Score: <strong className="text-foreground">100/100</strong></span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Play className="h-3 w-3 fill-current" /> Ready
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Feature Cards Grid with Stagger & Hover */}
        <motion.div variants={itemVariants} className="grid sm:grid-cols-3 gap-5 pt-6 text-left">
          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border/80 bg-card p-5 space-y-3 shadow-xs"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-2xs">
              <Video className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Video-Code Sync</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Video player synchronized with instructor code timeline. Seek to any milestone snapshot instantly.
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border/80 bg-card p-5 space-y-3 shadow-xs"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-2xs">
              <Code2 className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Integrated Workspace</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Full in-browser Monaco IDE with run execution, automated judge checkpoints, and diff comparisons.
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border/80 bg-card p-5 space-y-3 shadow-xs"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-2xs">
              <Cpu className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-foreground">Automated Grading</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Practice algorithm challenges and submit real GitHub project repositories for automated rubric evaluation.
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
