'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Hls from 'hls.js';
import {
  findBlockedSeekCheckpoint,
  findTriggeredCheckpoint,
  resolvePlaybackUrl,
  shouldSaveVideoProgress,
} from '../lib/video-learning';
import { getAccessToken } from '../lib/api/client';
import type { VideoCheckpoint } from '../lib/api';

interface VideoPlayerProps {
  readonly playbackUrl: string;
  readonly initialPositionSeconds?: number | undefined;
  readonly checkpoints?: readonly VideoCheckpoint[] | undefined;
  readonly progressSaveIntervalSeconds?: number | undefined;
  readonly onCheckpointCrossed?: ((checkpoint: VideoCheckpoint) => void) | undefined;
  readonly onProgress?: ((positionSeconds: number) => void) | undefined;
  readonly onTimeChange?: ((positionSeconds: number) => void) | undefined;
  readonly seekToSeconds?: number | null | undefined;
}

export function VideoPlayer({
  playbackUrl,
  initialPositionSeconds = 0,
  checkpoints = [],
  progressSaveIntervalSeconds = 10,
  onCheckpointCrossed,
  onProgress,
  onTimeChange,
  seekToSeconds,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previousTimeRef = useRef(initialPositionSeconds);
  const lastSavedAtRef = useRef(0);
  const lastSavedPositionRef = useRef(initialPositionSeconds);
  const triggeredCheckpointIdsRef = useRef(new Set<string>());
  const suppressSeekCheckRef = useRef(false);

  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkpointsRef = useRef(checkpoints);
  const onCheckpointCrossedRef = useRef(onCheckpointCrossed);
  const onProgressRef = useRef(onProgress);
  const onTimeChangeRef = useRef(onTimeChange);
  const progressSaveIntervalRef = useRef(progressSaveIntervalSeconds);

  useEffect(() => {
    checkpointsRef.current = checkpoints;
  }, [checkpoints]);

  useEffect(() => {
    onCheckpointCrossedRef.current = onCheckpointCrossed;
  }, [onCheckpointCrossed]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  useEffect(() => {
    progressSaveIntervalRef.current = progressSaveIntervalSeconds;
  }, [progressSaveIntervalSeconds]);

  useEffect(() => {
    previousTimeRef.current = initialPositionSeconds;
    lastSavedPositionRef.current = initialPositionSeconds;
    lastSavedAtRef.current = 0;
    triggeredCheckpointIdsRef.current = new Set();
    setPlaybackError(null);
  }, [initialPositionSeconds, playbackUrl, retryCount]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || seekToSeconds === null || seekToSeconds === undefined) {
      return;
    }

    const applySeek = () => {
      suppressSeekCheckRef.current = true;
      video.currentTime = Math.max(0, seekToSeconds);
      previousTimeRef.current = video.currentTime;
      onTimeChangeRef.current?.(video.currentTime);
    };

    if (Number.isNaN(video.duration)) {
      video.addEventListener('loadedmetadata', applySeek, { once: true });
      return () => video.removeEventListener('loadedmetadata', applySeek);
    }

    applySeek();
  }, [seekToSeconds]);

  const handleRetry = useCallback(() => {
    setPlaybackError(null);
    setRetryCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const currentVideo = videoRef.current;

    if (!currentVideo || !playbackUrl) {
      return;
    }

    const video: HTMLVideoElement = currentVideo;
    let destroyed = false;
    let hls: Hls | undefined;
    let initialPositionApplied = false;

    const token = getAccessToken();
    const resolvedUrl = resolvePlaybackUrl(playbackUrl, token);

    // Attach Hls.js or native playback
    if (Hls.isSupported()) {
      const player = new Hls({
        xhrSetup: (xhr) => {
          const currentToken = getAccessToken();
          if (currentToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${currentToken}`);
          }
          xhr.withCredentials = true;
        },
      });

      player.on(Hls.Events.ERROR, (_event, data) => {
        if (destroyed) {
          return;
        }

        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) {
          // Log technical error without exposing sensitive query parameters
          const cleanUrl = data.frag?.url?.split('?')[0] ?? data.url?.split('?')[0];
          console.warn('[HLS Playback Error]', {
            type: data.type,
            details: data.details,
            fatal: data.fatal,
            responseCode: data.response?.code,
            url: cleanUrl,
          });
        }

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (
                data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
              ) {
                setPlaybackError('Unable to load video stream. Please check your network connection.');
              } else if (
                data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
                data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
              ) {
                // Try non-destructive network reload
                player.startLoad();
              } else {
                player.startLoad();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              // Try non-destructive media decode recovery
              player.recoverMediaError();
              break;
            default:
              setPlaybackError('Video playback encountered an error. Click retry to reload.');
              player.destroy();
              break;
          }
        }
      });

      player.loadSource(resolvedUrl);
      player.attachMedia(video);
      hls = player;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS fallback (e.g. mobile Safari)
      video.src = resolvedUrl;
    } else {
      setPlaybackError('Your browser does not support HLS video playback.');
    }

    function applyInitialPosition() {
      if (initialPositionApplied || initialPositionSeconds <= 0 || Number.isNaN(video.duration)) {
        return;
      }

      initialPositionApplied = true;
      video.currentTime = Math.min(initialPositionSeconds, video.duration);
      previousTimeRef.current = video.currentTime;
      onTimeChangeRef.current?.(video.currentTime);
    }

    function triggerCheckpoint(checkpoint: VideoCheckpoint) {
      triggeredCheckpointIdsRef.current.add(checkpoint.id);
      suppressSeekCheckRef.current = true;
      video.currentTime = checkpoint.timestampSeconds;
      previousTimeRef.current = checkpoint.timestampSeconds;
      void video.pause();
      onCheckpointCrossedRef.current?.(checkpoint);
    }

    function handleTimeUpdate() {
      const previousTime = previousTimeRef.current;
      const currentTime = video.currentTime;
      const checkpoint = findTriggeredCheckpoint(
        previousTime,
        currentTime,
        checkpointsRef.current,
        triggeredCheckpointIdsRef.current,
      );

      onTimeChangeRef.current?.(currentTime);

      if (checkpoint) {
        triggerCheckpoint(checkpoint);
        return;
      }

      const now = Date.now();
      const pos = Math.floor(currentTime);

      if (
        onProgressRef.current &&
        pos !== lastSavedPositionRef.current &&
        shouldSaveVideoProgress(lastSavedAtRef.current, now, progressSaveIntervalRef.current)
      ) {
        lastSavedAtRef.current = now;
        lastSavedPositionRef.current = pos;
        onProgressRef.current(pos);
      }

      previousTimeRef.current = currentTime;
    }

    function handleSeeking() {
      if (suppressSeekCheckRef.current) {
        suppressSeekCheckRef.current = false;
        return;
      }

      const checkpoint = findBlockedSeekCheckpoint(
        previousTimeRef.current,
        video.currentTime,
        checkpointsRef.current,
      );

      if (checkpoint) {
        triggerCheckpoint(checkpoint);
      }
    }

    function handleVideoError() {
      if (!destroyed && !hls && video.error) {
        setPlaybackError('Video stream failed to load. Please try again.');
      }
    }

    video.addEventListener('loadedmetadata', applyInitialPosition);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('error', handleVideoError);

    return () => {
      const pos = Math.floor(video.currentTime);
      if (onProgressRef.current && pos > 0 && pos !== lastSavedPositionRef.current) {
        lastSavedPositionRef.current = pos;
        onProgressRef.current(pos);
      }

      destroyed = true;
      video.removeEventListener('loadedmetadata', applyInitialPosition);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('error', handleVideoError);
      if (hls) {
        hls.destroy();
      } else {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [initialPositionSeconds, playbackUrl, retryCount]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        controls
        playsInline
      />

      {playbackError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center text-white backdrop-blur-sm">
          <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
          <h4 className="mb-1 text-sm font-semibold">Playback Interrupted</h4>
          <p className="mb-4 max-w-md text-xs text-muted-foreground">{playbackError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Playback
          </button>
        </div>
      ) : null}
    </div>
  );
}
