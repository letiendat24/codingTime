'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Gauge,
  GitBranch,
  Github,
  Lock,
  PlayCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  Terminal,
  Video,
} from 'lucide-react';
import { Badge, Button } from '../design-system';
import { useCurrentUser } from '../hooks/use-current-user';
import { getRoleLandingPage } from '../lib/navigation';
import { useI18n } from '../providers/i18n-provider';

// Motion Animation Variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
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

const cardHoverVariants = {
  hover: {
    y: -4,
    scale: 1.01,
    transition: { duration: 0.2, ease: 'easeOut' as const },
  },
};

type WorkbenchTab = 'video-sync' | 'workspace' | 'judge' | 'project';

export default function HomePage() {
  const router = useRouter();
  const me = useCurrentUser();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('video-sync');

  useEffect(() => {
    if (me.data?.user) {
      router.replace(getRoleLandingPage(me.data.user.roles));
    }
  }, [me.data?.user, router]);

  return (
    <div className="relative min-h-full overflow-hidden bg-background select-text">
      {/* Dynamic Background Ambient Gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[560px] w-[820px] rounded-full bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-emerald-500/10 blur-[130px]" />
        <div className="absolute top-[800px] -left-32 h-[450px] w-[450px] rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="absolute top-[1600px] -right-32 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 space-y-24 sm:space-y-32">
        {/* ============================================================ */}
        {/* 1. HERO SECTION */}
        {/* ============================================================ */}
        <motion.section
          className="text-center space-y-8 max-w-4xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Top Pill Beacon */}
          <motion.div variants={itemVariants} className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-1.5 text-xs font-medium text-foreground backdrop-blur-md shadow-2xs hover:border-border transition-colors">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Nền tảng học lập trình & Đồng bộ Video-Code thế hệ mới</span>
            </div>
          </motion.div>

          {/* Title & Subheading */}
          <motion.div variants={itemVariants} className="space-y-4">
            <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-black tracking-tight text-foreground leading-[1.12]">
              Làm Chủ Kỹ Năng Kỹ Sư Với{' '}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 bg-clip-text text-transparent">
                Code-Along Tương Tác
              </span>
            </h1>

            <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
              Trải nghiệm học lập trình đồng bộ thời gian thực: Video bài giảng gắn liền với cây thư mục code,
              soạn thảo Monaco IDE trên trình duyệt, thực thi đa ngôn ngữ cô lập và hệ thống chấm điểm tự động.
            </p>
          </motion.div>

          {/* Action CTAs */}
          <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
            <Link href="/courses">
              <Button size="lg" className="h-11 px-6 text-sm font-semibold shadow-md group">
                <BookOpen className="h-4 w-4 mr-2" />
                <span>{t('courses.exploreCourses')}</span>
                <ArrowRight className="h-4 w-4 ml-1.5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/practice">
              <Button size="lg" variant="secondary" className="h-11 px-6 text-sm font-semibold shadow-xs hover:border-border">
                <Terminal className="h-4 w-4 mr-2 text-emerald-600 dark:text-emerald-400" />
                <span>{t('common.practice')}</span>
              </Button>
            </Link>
          </motion.div>

          {/* Key Value Feature Pills */}
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-3 text-xs text-muted-foreground font-medium"
          >
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 backdrop-blur-xs">
              <Video className="h-3.5 w-3.5 text-sky-500" />
              <span>Video-Code Sync</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 backdrop-blur-xs">
              <Lock className="h-3.5 w-3.5 text-emerald-500" />
              <span>Isolated Sandbox</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 backdrop-blur-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
              <span>Automated Judge</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 backdrop-blur-xs">
              <GitBranch className="h-3.5 w-3.5 text-purple-500" />
              <span>Git Project Grading</span>
            </span>
          </motion.div>
        </motion.section>

        {/* ============================================================ */}
        {/* 2. INTERACTIVE DEVELOPER WORKBENCH PREVIEW (TABBED SHOWCASE) */}
        {/* ============================================================ */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="space-y-4 max-w-5xl mx-auto"
        >
          {/* Workbench Tabs Header */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 p-1 rounded-xl bg-muted/60 border border-border/70 max-w-fit mx-auto">
            <button
              type="button"
              onClick={() => setActiveTab('video-sync')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'video-sync'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Video className="h-3.5 w-3.5 text-sky-500" />
              <span>1. Video & Code Sync</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'workspace'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Code2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>2. Monaco Sandbox</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('judge')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'judge'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
              <span>3. Automated Judge</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('project')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'project'
                  ? 'bg-card text-foreground shadow-xs border border-border/80'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5 text-purple-500" />
              <span>4. Project Grading</span>
            </button>
          </div>

          {/* Tab Content Window Mock */}
          <motion.div
            layout
            className="rounded-2xl border border-border/80 bg-card/90 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-md overflow-hidden text-left"
          >
            {/* Window Topbar */}
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-xs font-mono font-medium text-muted-foreground ml-2">
                  {activeTab === 'video-sync' && 'codesync://video-sync-player/timeline'}
                  {activeTab === 'workspace' && 'codesync://monaco-editor/src/server.ts'}
                  {activeTab === 'judge' && 'codesync://judge-engine/evaluation-suite'}
                  {activeTab === 'project' && 'codesync://project-grading/github-rubric'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Engine
                </span>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  v1.0.0-PROD
                </span>
              </div>
            </div>

            {/* Dynamic Tab Body */}
            <AnimatePresence mode="wait">
              {activeTab === 'video-sync' && (
                <motion.div
                  key="video-sync"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="grid lg:grid-cols-[1.1fr_1.2fr] divide-y lg:divide-y-0 lg:divide-x divide-border/60"
                >
                  {/* Left: Video Player Mock */}
                  <div className="p-5 bg-card/60 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="relative aspect-video rounded-xl bg-muted/90 border border-border/80 flex flex-col items-center justify-center overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex items-end p-3 text-white">
                          <div className="w-full space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span>04:15 / 12:40</span>
                              <span className="bg-sky-500/80 px-1.5 py-0.2 rounded text-[10px] font-semibold">Checkpoint #2</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-white/30 overflow-hidden relative">
                              <div className="h-full bg-sky-400 rounded-full" style={{ width: '34%' }} />
                            </div>
                          </div>
                        </div>
                        <PlayCircle className="h-12 w-12 text-white/90 drop-shadow-md group-hover:scale-110 transition-transform" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-foreground">Bài 04: Xây dựng Stream Controller & Video Progress</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Giảng viên: Nguyễn Văn A • Mốc thời gian 04:15</p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 p-2.5 text-xs text-sky-800 dark:text-sky-300 flex items-center justify-between">
                      <span className="text-[11px] font-medium">💡 Video nhảy đến đâu, Code snapshot tự cập nhật theo mốc đó!</span>
                    </div>
                  </div>

                  {/* Right: Code Sync Comparison Mock */}
                  <div className="p-5 font-mono text-xs space-y-3 bg-card">
                    <div className="flex items-center justify-between text-muted-foreground border-b border-border/50 pb-2">
                      <span className="text-[11px] font-sans font-semibold text-foreground">Instructor Code Snapshot @ 04:15</span>
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-foreground font-mono">Read Only Reference</span>
                    </div>
                    <div className="space-y-1.5 text-foreground/90 leading-relaxed text-[11px]">
                      <p className="text-muted-foreground">// Tự động đồng bộ với dòng thời gian bài giảng</p>
                      <p><span className="text-indigo-600 dark:text-indigo-400 font-semibold">export async function</span> <span className="text-blue-600 dark:text-blue-400 font-bold">handleStreamSync</span>(videoId, timestamp) &#123;</p>
                      <p className="pl-4"><span className="text-indigo-600 dark:text-indigo-400">const</span> snapshot = <span className="text-indigo-600 dark:text-indigo-400">await</span> videoTimeline.getSnapshot(timestamp);</p>
                      <p className="pl-4"><span className="text-indigo-600 dark:text-indigo-400">return</span> emitSyncEvent(&#123; videoId, snapshot &#125;);</p>
                      <p>&#125;</p>
                    </div>
                    <div className="pt-2 flex items-center gap-2 font-sans text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Workspace độc lập - Không ghi đè code của bạn
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'workspace' && (
                <motion.div
                  key="workspace"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="grid lg:grid-cols-[1.5fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border/60"
                >
                  <div className="p-5 font-mono text-xs text-foreground/90 space-y-2 leading-relaxed bg-card">
                    <p className="text-muted-foreground">// Viết code trực tiếp với Monaco Editor (VS Code Engine)</p>
                    <p><span className="text-indigo-600 dark:text-indigo-400 font-semibold">interface</span> <span className="text-emerald-600 dark:text-emerald-400">LRUCache</span>&lt;<span className="text-blue-600 dark:text-blue-400">K</span>, <span className="text-blue-600 dark:text-blue-400">V</span>&gt; &#123;</p>
                    <p className="pl-4">get(key: <span className="text-blue-600 dark:text-blue-400">K</span>): <span className="text-blue-600 dark:text-blue-400">V</span> | <span className="text-indigo-600 dark:text-indigo-400">undefined</span>;</p>
                    <p className="pl-4">put(key: <span className="text-blue-600 dark:text-blue-400">K</span>, value: <span className="text-blue-600 dark:text-blue-400">V</span>): <span className="text-indigo-600 dark:text-indigo-400">void</span>;</p>
                    <p>&#125;</p>
                    <p className="text-muted-foreground pt-1">// Chạy thử trên Sandbox cô lập với CPU & RAM limits</p>
                  </div>

                  <div className="p-4 bg-muted/20 flex flex-col justify-between space-y-3 font-sans">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">Sandbox Console Output</span>
                        <span className="font-mono text-[10px] text-muted-foreground">Exec: 18ms</span>
                      </div>
                      <pre className="rounded-lg bg-card p-3 font-mono text-[11px] text-foreground border border-border/60 leading-relaxed">
                        [Sandbox Log]: Initializing cache (capacity=100){'\n'}
                        [Sandbox Log]: Put key=&quot;user:102&quot; OK{'\n'}
                        [Sandbox Log]: Get key=&quot;user:102&quot; -&gt; Cache Hit!{'\n'}
                        [Process exit 0]
                      </pre>
                    </div>
                    <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Memory: <strong className="text-foreground">8.4 MB</strong></span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Sandbox Clean
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'judge' && (
                <motion.div
                  key="judge"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="p-5 font-sans space-y-4 bg-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div>
                      <h4 className="text-xs font-bold text-foreground">Automated Judge Evaluation Report</h4>
                      <p className="text-[11px] text-muted-foreground">Thuật toán: Two Sum with Hash Map • Ngôn ngữ: TypeScript 5.4</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="success">100/100 Điểm</Badge>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">PASSED</span>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">Test Case #1</span>
                        <Badge tone="success">Passed</Badge>
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground">nums=[2,7,11,15], target=9</p>
                      <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">12ms • 3.4MB</p>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">Test Case #2</span>
                        <Badge tone="success">Passed</Badge>
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground">nums=[3,2,4], target=6</p>
                      <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">14ms • 3.5MB</p>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-card p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">Protected Tests</span>
                        <Badge tone="success">10/10</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Hidden Edge Cases</p>
                      <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">All Passed (Hidden)</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'project' && (
                <motion.div
                  key="project"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="p-5 font-sans space-y-4 bg-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <Github className="h-5 w-5 text-foreground" />
                      <div>
                        <h4 className="text-xs font-bold text-foreground">Đồ án: E-Commerce Microservices Engine</h4>
                        <p className="text-[11px] text-muted-foreground font-mono">github.com/student/codesync-ecommerce-app</p>
                      </div>
                    </div>
                    <Badge tone="success">Điểm đạt: 95/100</Badge>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span>Milestone 1: Database Migration & Schema Design</span>
                      </div>
                      <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">25/25 pts</span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span>Milestone 2: JWT Authentication & Session Rotation</span>
                      </div>
                      <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">30/30 pts</span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span>Milestone 3: Asynchronous RabbitMQ Worker Pipeline</span>
                      </div>
                      <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">40/45 pts</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.section>

        {/* ============================================================ */}
        {/* 3. CORE CAPABILITIES (HỆ SINH THÁI TÍNH NĂNG ĐỘT PHÁ) */}
        {/* ============================================================ */}
        <section className="space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground">
              Hệ Sinh Thái Tính Năng Đột Phá
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Thiết kế chuyên sâu cho trải nghiệm học lập trình chuẩn công nghiệp, giải quyết triệt để rào cản cài đặt và đánh giá code.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Feature 1 */}
            <motion.div
              variants={cardHoverVariants}
              whileHover="hover"
              className="rounded-2xl border border-border/70 bg-card p-6 space-y-3.5 shadow-2xs hover:shadow-md hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 shadow-2xs">
                  <Video className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground">Đồng Bộ Video & Code Snapshot</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Video HLS player liên kết trực tiếp với dòng thời gian code của giảng viên. Xem code snapshot ở bất kỳ mốc nào và so sánh Diff trực quan mà không bị ghi đè code cá nhân.
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                <span>Timestamp Sync & Diff Check</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              variants={cardHoverVariants}
              whileHover="hover"
              className="rounded-2xl border border-border/70 bg-card p-6 space-y-3.5 shadow-2xs hover:shadow-md hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-2xs">
                  <Code2 className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground">Monaco Workspace Trong Trình Duyệt</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Trình soạn thảo Monaco IDE chuẩn VS Code: Hỗ trợ đa file, autocomplete, phím tắt quen thuộc, tự động lưu bản nháp và lưu trữ toàn bộ lịch sử revision bài làm.
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span>VS Code Engine & Revisions</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              variants={cardHoverVariants}
              whileHover="hover"
              className="rounded-2xl border border-border/70 bg-card p-6 space-y-3.5 shadow-2xs hover:shadow-md hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-2xs">
                  <Cpu className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground">Sandbox Thực Thi An Toàn</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Worker độc lập thực thi TypeScript, Python, C++, Go, Java, Rust trong môi trường sandbox cô lập với giới hạn nghiêm ngặt về CPU, Memory, Timeout và File limits.
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <span>Multi-Language Isolated Runners</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>

            {/* Feature 4 */}
            <motion.div
              variants={cardHoverVariants}
              whileHover="hover"
              className="rounded-2xl border border-border/70 bg-card p-6 space-y-3.5 shadow-2xs hover:shadow-md hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-2xs">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground">Hệ Thống Chấm Điểm Tự Động (Judge)</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Đánh giá tức thời qua hệ thống test case công khai và test case ẩn bảo mật. Cung cấp báo cáo thời gian thực thi (ms), tiêu thụ bộ nhớ và chi tiết lỗi runtime.
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                <span>Public & Hidden Test Suites</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>

            {/* Feature 5 */}
            <motion.div
              variants={cardHoverVariants}
              whileHover="hover"
              className="rounded-2xl border border-border/70 bg-card p-6 space-y-3.5 shadow-2xs hover:shadow-md hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-2xs">
                  <GitBranch className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground">Chấm Đồ Án GitHub Thực Chiến</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Nộp repository dự án thực tế qua GitHub. Worker tự động phân tích rubric, chạy test theo từng Milestone và trả về kết quả đánh giá toàn diện chuẩn mực.
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span>Repo Grading & Rubric Metrics</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>

            {/* Feature 6 */}
            <motion.div
              variants={cardHoverVariants}
              whileHover="hover"
              className="rounded-2xl border border-border/70 bg-card p-6 space-y-3.5 shadow-2xs hover:shadow-md hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-2xs">
                  <Gauge className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-foreground">Practice Hub & Thuật Toán</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ngân hàng bài tập thuật toán phong phú, phân cấp từ Junior đến Advance kèm bộ lọc tags. Theo dõi tiến độ giải quyết (Solved / Attempted) và điểm số tối ưu.
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <span>Algorithm Problem Bank</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 4. CLOSED-LOOP LEARNING WORKFLOW (QUY TRÌNH HỌC TẬP KHÉP KÍN) */}
        {/* ============================================================ */}
        <section className="rounded-3xl border border-border/80 bg-gradient-to-b from-card/90 to-card/40 p-8 sm:p-12 space-y-10 shadow-sm">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <Badge tone="info">Quy Trình Khép Kín</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              4 Bước Nâng Tầm Năng Lực Lập Trình
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Phương pháp học tích hợp giúp rút ngắn thời gian làm quen và nâng cao tốc độ phản hồi thực hành.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            <div className="space-y-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background font-black text-sm shadow-2xs">
                01
              </div>
              <h4 className="font-bold text-sm text-foreground">1. Chọn & Đăng Ký Khóa Học</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tiếp cận các lộ trình chất lượng cao từ Frontend, Backend, Hệ phân tán đến Kiến trúc phần mềm.
              </p>
            </div>

            <div className="space-y-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white font-black text-sm shadow-2xs">
                02
              </div>
              <h4 className="font-bold text-sm text-foreground">2. Xem Video & Code-Along</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Vừa theo dõi video bài giảng vừa tương tác trên Monaco Workspace với code snapshot đồng bộ.
              </p>
            </div>

            <div className="space-y-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-black text-sm shadow-2xs">
                03
              </div>
              <h4 className="font-bold text-sm text-foreground">3. Chạy Sandbox & Thử Nghiệm</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Thực thi mã nguồn tức thì trong container cô lập, quan sát console output và bắt lỗi runtime.
              </p>
            </div>

            <div className="space-y-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-sm shadow-2xs">
                04
              </div>
              <h4 className="font-bold text-sm text-foreground">4. Chấm Bài & Nhận Đánh Giá</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Nộp bài để hệ thống tự động kiểm tra test suite hoặc chấm đồ án GitHub, mở khóa bài học tiếp theo.
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 5. SUPPORTED TECHNOLOGIES & STATS */}
        {/* ============================================================ */}
        <section className="space-y-8 text-center">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Được Xây Dựng Cho Kỹ Sư Hiện Đại
            </h3>
            <p className="text-sm font-medium text-foreground">
              Hỗ trợ đầy đủ các ngôn ngữ và công nghệ phổ biến nhất
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
            {['TypeScript', 'Python', 'Go', 'C++', 'Rust', 'Java', 'Node.js', 'React', 'Docker', 'PostgreSQL', 'Redis', 'RabbitMQ'].map((tech) => (
              <span
                key={tech}
                className="rounded-xl border border-border/70 bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-2xs hover:border-border transition-colors font-mono"
              >
                {tech}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 max-w-4xl mx-auto">
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-foreground">0s</p>
              <p className="text-[11px] text-muted-foreground">Thời gian cài đặt môi trường</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-foreground">&lt; 100ms</p>
              <p className="text-[11px] text-muted-foreground">Độ trễ thực thi Sandbox</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-foreground">100%</p>
              <p className="text-[11px] text-muted-foreground">Cách ly Container an toàn</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-1">
              <p className="text-2xl sm:text-3xl font-black text-foreground">4 Trong 1</p>
              <p className="text-[11px] text-muted-foreground">Video, Code, Quiz & Project</p>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 6. BOTTOM CALL TO ACTION BANNER */}
        {/* ============================================================ */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="relative rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-8 sm:p-14 text-center space-y-6 shadow-md overflow-hidden"
        >
          <div className="space-y-3 max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              Sẵn Sàng Bứt Phá Kỹ Năng Lập Trình?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Trải nghiệm môi trường học tập tương tác hiện đại nhất ngay hôm nay. Khám phá kho tài liệu thực chiến và nâng cao trình độ kỹ sư phần mềm của bạn.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/courses">
              <Button size="lg" className="h-11 px-7 text-sm font-semibold shadow-md">
                <Rocket className="h-4 w-4 mr-2" />
                <span>Bắt Đầu Học Ngay</span>
              </Button>
            </Link>
            <Link href="/practice">
              <Button size="lg" variant="secondary" className="h-11 px-7 text-sm font-semibold">
                <Terminal className="h-4 w-4 mr-2" />
                <span>Thử Thách Thuật Toán</span>
              </Button>
            </Link>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
