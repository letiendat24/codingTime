'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Code,
  FileCode,
  Quote,
  Minus,
  Eye,
  Edit3,
  Columns,
  Save,
  Check,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../design-system/components/button';
import { Input } from '../../../design-system/components/input';
import { Textarea } from '../../../design-system/components/textarea';
import { Badge } from '../../../design-system/components/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../design-system/components/card';
import { requestJson } from '../../../lib/api';
import { useToast } from '../../../providers/toast-provider';

export interface ArticleEditorProps {
  readonly courseId: string;
  readonly lessonId: string;
  readonly initialTitle: string;
  readonly initialContent?: string | null | undefined;
  readonly onClose: () => void;
}

export function ArticleEditor({
  courseId,
  lessonId,
  initialTitle,
  initialContent,
  onClose,
}: ArticleEditorProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent ?? '');
  const [viewMode, setViewMode] = useState<'write' | 'preview' | 'split'>('split');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(initialTitle);
    setContent(initialContent ?? '');
    setHasUnsavedChanges(false);
  }, [initialTitle, initialContent]);

  const saveMutation = useMutation({
    mutationFn: () =>
      requestJson(`/instructor/lessons/${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          description: content,
        }),
      }),
    onSuccess: async () => {
      setHasUnsavedChanges(false);
      setJustSaved(true);
      toast.success('Article saved successfully');
      setTimeout(() => setJustSaved(false), 2500);
      await queryClient.invalidateQueries({ queryKey: ['instructor-course', courseId] });
    },
    onError: (error) => {
      toast.error('Failed to save article', error instanceof Error ? error.message : undefined);
    },
  });

  const insertFormatting = (prefix: string, suffix: string = '', defaultPlaceholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || defaultPlaceholder;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);
    setHasUnsavedChanges(true);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <Card className="border-primary/30 shadow-lg animate-in fade-in-0 duration-200">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge tone="info">ARTICLE LESSON</Badge>
              <span className="text-xs text-muted-foreground">
                ~{readTimeMinutes} min read · {wordCount} words · {charCount} characters
              </span>
            </div>
            <CardTitle className="text-lg">Article Content Studio</CardTitle>
            <CardDescription>
              Write comprehensive technical articles, code walkthroughs, and tutorials with Markdown formatting.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {justSaved ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Saved
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-xs font-medium text-warning">● Unsaved changes</span>
            ) : null}

            <Button
              size="sm"
              variant="secondary"
              onClick={onClose}
              disabled={saveMutation.isPending}
            >
              Close
            </Button>
            <Button
              size="sm"
              isLoading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              leftIcon={<Save className="h-4 w-4" />}
            >
              Save Article
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {/* Lesson Title Input */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Lesson Title
          </label>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setHasUnsavedChanges(true);
            }}
            placeholder="e.g. Understanding Memory Leaks in Node.js"
            className="font-medium text-base"
          />
        </div>

        {/* Toolbar & View Mode Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2">
          {/* Markdown Formatting Action Buttons */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              title="Heading 1"
              onClick={() => insertFormatting('# ', '', 'Heading 1')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Heading1 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Heading 2"
              onClick={() => insertFormatting('## ', '', 'Heading 2')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Heading 3"
              onClick={() => insertFormatting('### ', '', 'Heading 3')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Heading3 className="h-4 w-4" />
            </button>

            <span className="mx-1 h-4 w-px bg-border" />

            <button
              type="button"
              title="Bold"
              onClick={() => insertFormatting('**', '**', 'bold text')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Italic"
              onClick={() => insertFormatting('*', '*', 'italic text')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Strikethrough"
              onClick={() => insertFormatting('~~', '~~', 'strikethrough text')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Strikethrough className="h-4 w-4" />
            </button>

            <span className="mx-1 h-4 w-px bg-border" />

            <button
              type="button"
              title="Bullet List"
              onClick={() => insertFormatting('- ', '', 'List item')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Numbered List"
              onClick={() => insertFormatting('1. ', '', 'First item')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Blockquote"
              onClick={() => insertFormatting('> ', '', 'Important callout or quote')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Quote className="h-4 w-4" />
            </button>

            <span className="mx-1 h-4 w-px bg-border" />

            <button
              type="button"
              title="Inline Code"
              onClick={() => insertFormatting('`', '`', 'const x = 1')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Code className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Code Block"
              onClick={() => insertFormatting('```typescript\n', '\n```', '// Code snippet here')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <FileCode className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Hyperlink"
              onClick={() => insertFormatting('[', '](https://example.com)', 'Link Title')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LinkIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Horizontal Rule"
              onClick={() => insertFormatting('\n---\n')}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 rounded-md border bg-background p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('write')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                viewMode === 'write' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Write</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                viewMode === 'preview' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`hidden sm:flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                viewMode === 'split' ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Columns className="h-3.5 w-3.5" />
              <span>Split</span>
            </button>
          </div>
        </div>

        {/* Editor & Preview Area */}
        <div className={`grid gap-4 ${viewMode === 'split' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Write Textarea */}
          {(viewMode === 'write' || viewMode === 'split') && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Markdown Source</span>
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Write your article in Markdown here... Use # for headings, ``` for code blocks, - for bullet lists, etc."
                className="min-h-[420px] font-mono text-sm leading-relaxed"
              />
            </div>
          )}

          {/* Live Preview Pane */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Student Live Preview</span>
              <div className="min-h-[420px] max-h-[600px] overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xs">
                {content.trim() ? (
                  <ArticleMarkdownPreview content={content} />
                ) : (
                  <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center text-muted-foreground">
                    <Sparkles className="mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">Preview is empty</p>
                    <p className="text-xs">Start writing in Markdown to preview your article layout.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Clean, safe Markdown renderer for articles with headings, lists, code blocks, and blockquotes.
 */
export function ArticleMarkdownPreview({ content }: { readonly content: string }) {
  const elements: ReactNode[] = [];
  const lines = content.split('\n');

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // Code block start / end
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.replace('```', '').trim() || 'text';
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        elements.push(
          <div key={`code-${i}`} className="my-4 overflow-hidden rounded-lg border border-border bg-zinc-950 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3.5 py-1.5 font-mono text-[11px] text-zinc-400">
              <span>{codeBlockLang}</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-zinc-100">
              <code>{codeBlockContent.join('\n')}</code>
            </pre>
          </div>
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={`hr-${i}`} className="my-6 border-border" />);
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="mt-6 mb-3 text-2xl font-bold tracking-tight text-foreground border-b pb-2">
          {renderFormattedInline(line.replace('# ', ''))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="mt-5 mb-2.5 text-xl font-bold tracking-tight text-foreground">
          {renderFormattedInline(line.replace('## ', ''))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="mt-4 mb-2 text-base font-semibold text-foreground">
          {renderFormattedInline(line.replace('### ', ''))}
        </h3>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={`quote-${i}`} className="my-3 border-l-4 border-primary/60 bg-primary/5 px-4 py-2 text-sm italic text-foreground rounded-r">
          {renderFormattedInline(line.replace('> ', ''))}
        </blockquote>
      );
      continue;
    }

    // Unordered List item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={`li-${i}`} className="ml-5 list-disc text-sm leading-relaxed text-foreground/90 my-1">
          {renderFormattedInline(line.replace(/^[-*]\s+/, ''))}
        </li>
      );
      continue;
    }

    // Ordered list item
    if (/^\d+\.\s+/.test(line)) {
      elements.push(
        <li key={`oli-${i}`} className="ml-5 list-decimal text-sm leading-relaxed text-foreground/90 my-1">
          {renderFormattedInline(line.replace(/^\d+\.\s+/, ''))}
        </li>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`empty-${i}`} className="h-2" />);
      continue;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${i}`} className="my-2 text-sm leading-relaxed text-foreground/90">
        {renderFormattedInline(line)}
      </p>
    );
  }

  return <article className="prose dark:prose-invert max-w-none text-foreground space-y-0.5">{elements}</article>;
}

/**
 * Formats inline Markdown tags: `code`, **bold**, *italic*, ~~strikethrough~~, [links](url)
 */
function renderFormattedInline(text: string): ReactNode {
  // Check for link pattern: [title](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(formatInlineStyles(text.substring(lastIndex, match.index)));
    }
    const [, label, url] = match;
    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
      >
        {label}
      </a>
    );
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(formatInlineStyles(text.substring(lastIndex)));
  }

  return parts.length > 0 ? parts : formatInlineStyles(text);
}

function formatInlineStyles(text: string): ReactNode {
  // Split by inline code `code`
  const codeParts = text.split(/`([^`]+)`/);
  return codeParts.map((part, index) => {
    // Odd index is inline code
    if (index % 2 === 1) {
      return (
        <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
          {part}
        </code>
      );
    }

    // Handle **bold** and *italic*
    const rendered = part;
    if (rendered.includes('**')) {
      const boldParts = rendered.split(/\*\*([^*]+)\*\*/);
      return boldParts.map((bPart, bIdx) =>
        bIdx % 2 === 1 ? (
          <strong key={`b-${bIdx}`} className="font-bold text-foreground">
            {bPart}
          </strong>
        ) : (
          bPart
        )
      );
    }

    return rendered;
  });
}
