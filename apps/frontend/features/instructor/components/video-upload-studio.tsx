'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Film,
  RefreshCw,
  FileVideo,
  RotateCcw,
} from 'lucide-react';
import { VideoPlayer } from '../../../components/video-player';
import { Button } from '../../../design-system/components/button';
import { Badge } from '../../../design-system/components/badge';
import { Card, CardContent } from '../../../design-system/components/card';
import { type VideoStatus, requestJson } from '../../../lib/api';
import { formatTime } from '../../../lib/video-learning';
import { useToast } from '../../../providers/toast-provider';

interface VideoUploadIntent {
  readonly uploadUrl: string;
  readonly videoAssetId: string;
}

export interface VideoUploadStudioProps {
  readonly lessonId: string;
  readonly existingVideoAssetId?: string | null | undefined;
  readonly onVideoReady?: (videoAssetId: string) => void;
  readonly onTimeChange?: (currentSeconds: number) => void;
  readonly seekToSeconds?: number | null | undefined;
}

export function VideoUploadStudio({
  lessonId,
  existingVideoAssetId,
  onVideoReady,
  onTimeChange,
  seekToSeconds,
}: VideoUploadStudioProps) {
  const toast = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [activeVideoAssetId, setActiveVideoAssetId] = useState<string | null>(existingVideoAssetId ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifiedAssetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (existingVideoAssetId && existingVideoAssetId !== activeVideoAssetId) {
      setActiveVideoAssetId(existingVideoAssetId);
    }
  }, [existingVideoAssetId, activeVideoAssetId]);

  // Discover existing video for lesson if not explicitly provided
  const lessonVideoQuery = useQuery({
    queryKey: ['instructor-lesson-video', lessonId],
    enabled: !activeVideoAssetId && Boolean(lessonId),
    queryFn: async () => {
      const res = await requestJson<{ readonly video: VideoStatus | null }>(`/instructor/lessons/${lessonId}/video`);
      if (res.video?.id) {
        setActiveVideoAssetId(res.video.id);
      }
      return res.video;
    },
    staleTime: 30_000,
  });

  // Poll video processing status
  const videoQuery = useQuery({
    queryKey: ['instructor-video-status', activeVideoAssetId],
    enabled: Boolean(activeVideoAssetId),
    queryFn: async () => {
      const res = await requestJson<{ readonly video: VideoStatus }>(`/instructor/videos/${activeVideoAssetId}`);
      return res.video;
    },
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'PROCESSING' ? 2500 : false;
    },
  });

  useEffect(() => {
    const currentVideo = videoQuery.data ?? lessonVideoQuery.data;
    if (
      currentVideo?.status === 'READY' &&
      currentVideo.id &&
      onVideoReady &&
      notifiedAssetIdRef.current !== currentVideo.id
    ) {
      notifiedAssetIdRef.current = currentVideo.id;
      onVideoReady(currentVideo.id);
    }
  }, [videoQuery.data, lessonVideoQuery.data, onVideoReady]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadError(null);
      setIsUploading(true);
      setUploadPercent(0);
      setUploadedBytes(0);

      try {
        // Step 1: Request upload session
        const intent = await requestJson<VideoUploadIntent>(
          `/instructor/lessons/${lessonId}/video/upload-intent`,
          {
            method: 'POST',
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type || 'video/mp4',
              sizeBytes: file.size,
            }),
          }
        );

        setActiveVideoAssetId(intent.videoAssetId);

        // Step 2: Upload file with XMLHTTPRequest for accurate progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', intent.uploadUrl, true);
          xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              setUploadPercent(percent);
              setUploadedBytes(event.loaded);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during video upload'));
          xhr.send(file);
        });

        // Step 3: Complete upload and initiate automated transcoding
        const completed = await requestJson<{ readonly video: VideoStatus }>(
          `/instructor/videos/${intent.videoAssetId}/complete-upload`,
          { method: 'POST' }
        );

        setIsUploading(false);
        setIsReplacing(false);
        setSelectedFile(null);
        toast.success('Upload complete!', 'Automated multi-resolution processing has started.');
        return completed.video;
      } catch (err: unknown) {
        setIsUploading(false);
        const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setUploadError(msg);
        toast.error('Video upload failed', msg);
        throw err;
      }
    },
    onSuccess: () => {
      void videoQuery.refetch();
    },
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      requestJson<{ readonly video: VideoStatus }>(`/instructor/videos/${activeVideoAssetId}/retry`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Processing restarted', 'We are attempting to process the video again.');
      void videoQuery.refetch();
    },
    onError: (error) => {
      toast.error('Retry failed', error instanceof Error ? error.message : undefined);
    },
  });

  const video = videoQuery.data ?? lessonVideoQuery.data;
  const status = video?.status;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // 1. Initial State: No video uploaded yet, or instructor chose to replace
  if (!activeVideoAssetId || (isReplacing && !isUploading)) {
    return (
      <Card className="border-dashed border-2 border-primary/20 bg-card">
        <CardContent className="p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setSelectedFile(file);
              setUploadError(null);
            }}
          />

          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center py-8 text-center cursor-pointer hover:bg-muted/20 rounded-lg transition-colors"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                <Upload className="h-7 w-7" />
              </div>
              <h4 className="text-base font-semibold text-foreground">Upload Lesson Video</h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Select an MP4, MOV, or WebM video file. We will optimize it for smooth, adaptive streaming playback on all student devices.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" type="button" leftIcon={<FileVideo className="h-4 w-4" />}>
                  Choose Video File
                </Button>
                {isReplacing && (
                  <Button size="sm" variant="secondary" type="button" onClick={() => setIsReplacing(false)}>
                    Keep Existing Video
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Film className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Change
                </Button>
              </div>

              {uploadError ? (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                {isReplacing && (
                  <Button size="sm" variant="secondary" onClick={() => setIsReplacing(false)}>
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => uploadMutation.mutate(selectedFile)}
                  leftIcon={<Upload className="h-4 w-4" />}
                >
                  Start Upload
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // 2. Uploading State: Tracking byte transfer
  if (isUploading) {
    return (
      <Card className="border-primary/30 bg-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary animate-pulse">
                <Upload className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Uploading Video</h4>
                <p className="text-xs text-muted-foreground">
                  {selectedFile?.name ?? 'Lesson Video'}
                </p>
              </div>
            </div>
            <span className="font-mono text-sm font-bold text-primary">{uploadPercent}%</span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-150 ease-out rounded-full"
              style={{ width: `${uploadPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatFileSize(uploadedBytes)} of {formatFileSize(selectedFile?.size ?? 0)}
            </span>
            <span>Please keep this browser window open</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 3. Processing State: Backend is transcoding video into multi-resolution HLS streams
  if (status === 'QUEUED' || status === 'PROCESSING') {
    const processingPercent = video?.progress ?? 0;

    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary animate-spin">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Optimizing Video for Streaming</h4>
                <p className="text-xs text-muted-foreground">
                  Generating multi-resolution adaptive streams (1080p, 720p, 480p, 360p) for high-performance playback.
                </p>
              </div>
            </div>
            <Badge tone="warning">Processing {processingPercent}%</Badge>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
              style={{ width: `${Math.max(5, processingPercent)}%` }}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            You can continue configuring Code-Along snapshots or lesson checkpoints below while optimization completes in the background.
          </p>
        </CardContent>
      </Card>
    );
  }

  // 4. Failed State: Transcoding encountered an issue
  if (status === 'FAILED') {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-destructive">Video Optimization Failed</h4>
              <p className="text-xs text-muted-foreground">
                We encountered an issue while encoding the video for streaming. You can retry optimization or upload a replacement file.
              </p>
              {video?.latestJob?.lastErrorMessage ? (
                <p className="text-xs font-mono text-destructive/90 bg-destructive/10 p-2 rounded">
                  {video.latestJob.lastErrorMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-destructive/20">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsReplacing(true)}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              Upload Different Video
            </Button>
            <Button
              size="sm"
              isLoading={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
              leftIcon={<RotateCcw className="h-4 w-4" />}
            >
              Retry Optimization
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 5. Ready State: Transcoding finished, video is ready for student streaming
  return (
    <Card className="border-success/30 bg-card overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">Video Ready for Students</h4>
              <p className="text-xs text-muted-foreground">
                Duration: {video?.durationSeconds ? formatTime(video.durationSeconds) : 'Ready'} · Adaptive HLS Streaming
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1">
              {video?.renditions && video.renditions.length > 0 ? (
                video.renditions.map((rendition) => (
                  <Badge key={rendition.quality} variant="outline" className="text-[10px]">
                    {rendition.quality}
                  </Badge>
                ))
              ) : (
                <>
                  <Badge variant="outline" className="text-[10px]">1080p</Badge>
                  <Badge variant="outline" className="text-[10px]">720p</Badge>
                  <Badge variant="outline" className="text-[10px]">480p</Badge>
                </>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsReplacing(true)}
              leftIcon={<Film className="h-3.5 w-3.5" />}
            >
              Replace Video
            </Button>
          </div>
        </div>

        {video?.playbackUrl ? (
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <VideoPlayer
              playbackUrl={video.playbackUrl}
              onTimeChange={onTimeChange}
              seekToSeconds={seekToSeconds}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
