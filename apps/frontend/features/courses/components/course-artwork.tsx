'use client';

import { useMemo } from 'react';

export type CourseTheme = 'blue' | 'mint' | 'sand' | 'lavender' | 'rose' | 'yellow' | 'cyan' | 'peach';

export interface CourseArtworkProps {
  readonly title: string;
  readonly categoryName?: string | undefined;
  readonly tags?: readonly { readonly name: string }[] | undefined;
  readonly slug?: string | undefined;
  readonly lessonCount?: number | undefined;
  readonly className?: string | undefined;
}

export function getCourseTheme(title: string, categoryName = '', tags: readonly { readonly name: string }[] = [], slug = ''): CourseTheme {
  const combined = `${title} ${categoryName} ${tags.map((t) => t.name).join(' ')} ${slug}`.toLowerCase();

  if (combined.includes('typescript') || combined.includes('ts')) return 'blue';
  if (combined.includes('react') || combined.includes('frontend') || combined.includes('ui') || combined.includes('next.js')) return 'cyan';
  if (combined.includes('node') || combined.includes('backend') || combined.includes('api') || combined.includes('express')) return 'mint';
  if (combined.includes('javascript') || combined.includes('js') || combined.includes('web')) return 'yellow';
  if (combined.includes('test') || combined.includes('qa') || combined.includes('vitest') || combined.includes('jest')) return 'lavender';
  if (combined.includes('git') || combined.includes('devops') || combined.includes('docker')) return 'peach';
  if (combined.includes('security') || combined.includes('auth') || combined.includes('architecture')) return 'rose';
  if (combined.includes('python') || combined.includes('data')) return 'mint';

  // Deterministic fallback by char code hash
  const hash = slug.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const themes: readonly CourseTheme[] = ['sand', 'blue', 'mint', 'lavender', 'yellow', 'cyan', 'peach', 'rose'];
  return themes[hash % themes.length] ?? 'sand';
}

type IllustrationVariant = 'folder' | 'search' | 'window' | 'action-pill' | 'terminal' | 'layers' | 'brackets';

function getIllustrationVariant(title: string, slug = ''): IllustrationVariant {
  const hash = (title + slug).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const variants: readonly IllustrationVariant[] = [
    'folder',
    'search',
    'window',
    'action-pill',
    'terminal',
    'layers',
    'brackets',
  ];
  return variants[hash % variants.length] ?? 'folder';
}

const themeStyles: Record<
  CourseTheme,
  {
    readonly bg: string;
    readonly shapeBg: string;
    readonly shapeBorder: string;
    readonly shapeAccent: string;
    readonly shapeText: string;
  }
> = {
  blue: {
    bg: 'bg-[#E7EFF8] dark:bg-[#1D2633]',
    shapeBg: 'bg-[#5B88B4]/85 dark:bg-[#6D9BCA]',
    shapeBorder: 'border-[#45709B]/30',
    shapeAccent: 'bg-[#89ADD4]',
    shapeText: 'text-[#234568] dark:text-[#A7C5E5]',
  },
  mint: {
    bg: 'bg-[#E6F2EA] dark:bg-[#1A2D23]',
    shapeBg: 'bg-[#599A77]/85 dark:bg-[#67AA86]',
    shapeBorder: 'border-[#417E5E]/30',
    shapeAccent: 'bg-[#83BFA1]',
    shapeText: 'text-[#1E4D34] dark:text-[#A2D4BB]',
  },
  sand: {
    bg: 'bg-[#F2ECE1] dark:bg-[#2D2923]',
    shapeBg: 'bg-[#8E795D]/85 dark:bg-[#A38E71]',
    shapeBorder: 'border-[#6F5B41]/30',
    shapeAccent: 'bg-[#BAAA92]',
    shapeText: 'text-[#483721] dark:text-[#D1C3AD]',
  },
  lavender: {
    bg: 'bg-[#ECE9F5] dark:bg-[#262335]',
    shapeBg: 'bg-[#7E74A6]/85 dark:bg-[#9288BC]',
    shapeBorder: 'border-[#645A8B]/30',
    shapeAccent: 'bg-[#A89FD0]',
    shapeText: 'text-[#3E3466] dark:text-[#C5BDE3]',
  },
  rose: {
    bg: 'bg-[#F4E8EC] dark:bg-[#332128]',
    shapeBg: 'bg-[#A86E7F]/85 dark:bg-[#BC8193]',
    shapeBorder: 'border-[#8A5162]/30',
    shapeAccent: 'bg-[#CCA0AD]',
    shapeText: 'text-[#5C2736] dark:text-[#E2BAC6]',
  },
  yellow: {
    bg: 'bg-[#F3EFD9] dark:bg-[#302D1E]',
    shapeBg: 'bg-[#988C49]/85 dark:bg-[#AEA159]',
    shapeBorder: 'border-[#796D31]/30',
    shapeAccent: 'bg-[#C5BB7E]',
    shapeText: 'text-[#514714] dark:text-[#DFD7A5]',
  },
  cyan: {
    bg: 'bg-[#E4F1F2] dark:bg-[#192A2C]',
    shapeBg: 'bg-[#528C93]/85 dark:bg-[#63A0A8]',
    shapeBorder: 'border-[#3B7279]/30',
    shapeAccent: 'bg-[#7EB6BC]',
    shapeText: 'text-[#1C4B51] dark:text-[#A3D2D7]',
  },
  peach: {
    bg: 'bg-[#F7ECE1] dark:bg-[#30241E]',
    shapeBg: 'bg-[#A6785C]/85 dark:bg-[#BA8A6E]',
    shapeBorder: 'border-[#875B40]/30',
    shapeAccent: 'bg-[#CE9F82]',
    shapeText: 'text-[#5A311A] dark:text-[#DFC0AD]',
  },
};

export function CourseArtwork({
  title,
  categoryName,
  tags,
  slug,
  lessonCount,
  className = '',
}: CourseArtworkProps) {
  const theme = useMemo(() => getCourseTheme(title, categoryName, tags, slug), [title, categoryName, tags, slug]);
  const variant = useMemo(() => getIllustrationVariant(title, slug), [title, slug]);
  const style = themeStyles[theme];

  return (
    <div
      className={`relative h-38 sm:h-40 w-full overflow-hidden rounded-t-xl transition-all ${style.bg} ${className} flex items-center justify-center`}
    >
      {/* Lesson Count Floating Badge */}
      {lessonCount !== undefined && lessonCount > 0 ? (
        <div className="absolute left-3 top-3 z-10">
          <span className="inline-flex items-center rounded-md bg-black/8 dark:bg-white/10 px-2 py-0.5 text-[11px] font-medium text-foreground/85 backdrop-blur-xs">
            {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
          </span>
        </div>
      ) : null}

      {/* Abstract Shape Illustration */}
      <div className="relative flex items-center justify-center p-4 transition-transform duration-300 group-hover:scale-105">
        {variant === 'folder' && (
          <div className="relative flex flex-col items-center">
            {/* Folder tab */}
            <div className={`h-2.5 w-7 rounded-t-sm self-start ml-2 ${style.shapeAccent} opacity-80`} />
            {/* Folder body */}
            <div
              className={`h-14 w-18 sm:h-15 sm:w-20 rounded-lg shadow-sm border ${style.shapeBg} ${style.shapeBorder} flex items-center justify-center`}
            >
              <div className="h-1 w-6 rounded-full bg-white/30" />
            </div>
          </div>
        )}

        {variant === 'search' && (
          <div className="flex items-center gap-1.5 rounded-full bg-white/70 dark:bg-black/40 px-3.5 py-1.5 shadow-xs border border-black/5 dark:border-white/10">
            <span className={`text-xs font-medium tracking-tight ${style.shapeText}`}>
              {title.split(' ')[0] || 'Code'}
            </span>
            <span className="inline-block h-3 w-0.5 animate-pulse bg-current opacity-70" />
            <div className="ml-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/10 dark:bg-white/10 text-[9px] text-muted-foreground font-bold leading-none">
              ×
            </div>
          </div>
        )}

        {variant === 'window' && (
          <div
            className={`h-14 w-20 sm:h-15 sm:w-22 rounded-lg bg-white/80 dark:bg-black/40 shadow-xs border border-black/5 dark:border-white/10 p-1.5 flex flex-col justify-between`}
          >
            <div className="flex items-center gap-1 border-b border-black/5 dark:border-white/5 pb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-black/20 dark:bg-white/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-black/20 dark:bg-white/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-black/20 dark:bg-white/20" />
            </div>
            <div className="flex items-center justify-center">
              <span className={`text-[10px] font-mono font-semibold ${style.shapeText}`}>
                &lt; / &gt;
              </span>
            </div>
          </div>
        )}

        {variant === 'action-pill' && (
          <div className="flex items-center gap-2 rounded-full bg-foreground text-background px-3.5 py-1.5 shadow-sm text-xs font-medium">
            <span>Explore</span>
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background/20 text-[10px] leading-none">
              →
            </span>
          </div>
        )}

        {variant === 'terminal' && (
          <div
            className={`h-14 w-20 sm:h-15 sm:w-22 rounded-lg ${style.shapeBg} ${style.shapeBorder} border shadow-xs p-2 flex flex-col justify-between text-white/90`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono font-bold">&gt;_</span>
            </div>
            <div className="space-y-1">
              <div className="h-1 w-10 rounded-full bg-white/40" />
              <div className="h-1 w-6 rounded-full bg-white/25" />
            </div>
          </div>
        )}

        {variant === 'layers' && (
          <div className="relative flex items-center justify-center">
            <div
              className={`absolute -top-1.5 h-12 w-16 rounded-md ${style.shapeAccent} opacity-50`}
            />
            <div
              className={`relative h-13 w-18 rounded-lg ${style.shapeBg} ${style.shapeBorder} border shadow-xs flex items-center justify-center`}
            >
              <div className="h-1.5 w-7 rounded-full bg-white/30" />
            </div>
          </div>
        )}

        {variant === 'brackets' && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-white/70 dark:bg-black/40 px-4 py-2.5 shadow-xs border border-black/5 dark:border-white/10">
            <span className={`text-base font-mono font-bold ${style.shapeText}`}>&#123;</span>
            <div className={`h-2 w-2 rounded-full ${style.shapeBg}`} />
            <span className={`text-base font-mono font-bold ${style.shapeText}`}>&#125;</span>
          </div>
        )}
      </div>
    </div>
  );
}
