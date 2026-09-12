'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Columns, FileCode } from 'lucide-react';
import { Button, Dialog } from '../../../design-system';
import type { CodeSnapshotDetail, WorkspaceFile } from '../../../lib/api';
import { compareCodeFiles } from '../../../lib/video-learning';
import { useI18n } from '../../../providers/i18n-provider';
import { useTheme } from '../../../providers/theme-provider';

const MonacoDiffEditor = dynamic(
  () => import('@monaco-editor/react').then((module) => module.DiffEditor),
  { ssr: false },
);

export interface DiffModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly studentFiles: readonly WorkspaceFile[];
  readonly instructorSnapshot?: CodeSnapshotDetail | undefined;
  readonly language?: string | undefined;
}

export function DiffModal({
  open,
  onClose,
  studentFiles,
  instructorSnapshot,
  language = 'javascript',
}: DiffModalProps) {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const comparison = useMemo(
    () => compareCodeFiles(studentFiles, instructorSnapshot?.files ?? []),
    [studentFiles, instructorSnapshot?.files],
  );

  const activeDiff = comparison.files.find((f) => f.path === selectedPath) ?? comparison.files[0];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="full"
      title={
        <div className="flex items-center gap-2">
          <Columns className="h-5 w-5 text-primary" />
          <span>{t('learning.compare')}</span>
        </div>
      }
      description={
        <span>
          Compare your workspace code with the instructor snapshot ({comparison.summary.modified} modified,{' '}
          {comparison.summary.studentOnly} only in your code, {comparison.summary.instructorOnly} only in instructor code).
        </span>
      }
    >
      <div className="space-y-4">
        {/* File Tabs for Diff */}
        <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
          {comparison.files.map((file) => {
            const isSelected = (selectedPath ?? comparison.files[0]?.path) === file.path;
            const statusColor =
              file.status === 'MODIFIED'
                ? 'text-amber-500 bg-amber-500/10'
                : file.status === 'STUDENT_ONLY'
                ? 'text-blue-500 bg-blue-500/10'
                : file.status === 'INSTRUCTOR_ONLY'
                ? 'text-purple-500 bg-purple-500/10'
                : 'text-muted-foreground bg-muted';

            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? 'border border-primary bg-primary/10 text-primary font-bold'
                    : 'border border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>{file.path}</span>
                <span className={`rounded px-1 text-[10px] uppercase font-bold ${statusColor}`}>
                  {file.status.replace('_', ' ')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Diff labels */}
        <div className="grid grid-cols-2 gap-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          <div className="flex items-center gap-2 text-purple-400">
            <span>Instructor Code (Original)</span>
          </div>
          <div className="flex items-center gap-2 text-primary">
            <span>Your Code (Workspace)</span>
          </div>
        </div>

        {/* Monaco Diff Viewer */}
        <div className="overflow-hidden rounded-lg border border-border">
          <MonacoDiffEditor
            height="440px"
            language={language === 'javascript' ? 'javascript' : 'plaintext'}
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
            original={activeDiff?.instructorContent ?? ''}
            modified={activeDiff?.studentContent ?? ''}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              renderSideBySide: true,
            }}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
