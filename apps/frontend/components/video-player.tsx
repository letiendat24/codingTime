'use client';

import { useEffect, useRef } from 'react';
import {
  findBlockedSeekCheckpoint,
  findTriggeredCheckpoint,
  shouldSaveVideoProgress,
} from '../lib/video-learning';
import type { VideoCheckpoint } from '../lib/api';

interface VideoPlayerProps {
  readonly playbackUrl: string;
  readonly initialPositionSeconds?: number;
  readonly checkpoints?: readonly VideoCheckpoint[];
  readonly progressSaveIntervalSeconds?: number;
  readonly onCheckpointCrossed?: (checkpoint: VideoCheckpoint) => void;
  readonly onProgress?: (positionSeconds: number) => void;
  readonly onTimeChange?: (positionSeconds: number) => void;
  readonly seekToSeconds?: number | null;
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
  const triggeredCheckpointIdsRef = useRef(new Set<string>());
  const suppressSeekCheckRef = useRef(false);

  useEffect(() => {
    previousTimeRef.current = initialPositionSeconds;
    lastSavedAtRef.current = 0;
    triggeredCheckpointIdsRef.current = new Set();
  }, [initialPositionSeconds, playbackUrl]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || seekToSeconds === null || seekToSeconds === undefined) {
      return;
    }

    const applySeek = () => {
      suppressSeekCheckRef.current = true;
      video.currentTime = Math.max(0, seekToSeconds);
      previousTimeRef.current = video.currentTime;
      onTimeChange?.(video.currentTime);
    };

    if (Number.isNaN(video.duration)) {
      video.addEventListener('loadedmetadata', applySeek, { once: true });
      return () => video.removeEventListener('loadedmetadata', applySeek);
    }

    applySeek();
  }, [onTimeChange, seekToSeconds]);

  useEffect(() => {
    const currentVideo = videoRef.current;

    if (!currentVideo) {
      return;
    }

    const video: HTMLVideoElement = currentVideo;
    let destroyed = false;
    let hls: { destroy: () => void } | undefined;
    let initialPositionApplied = false;

    async function attach() {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playbackUrl;
        return;
      }

      const Hls = (await import('hls.js')).default;

      if (destroyed || !Hls.isSupported()) {
        return;
      }

      const player = new Hls();
      player.loadSource(playbackUrl);
      player.attachMedia(video);
      hls = player;
    }

    function applyInitialPosition() {
      if (initialPositionApplied || initialPositionSeconds <= 0 || Number.isNaN(video.duration)) {
        return;
      }

      initialPositionApplied = true;
      video.currentTime = Math.min(initialPositionSeconds, video.duration);
      previousTimeRef.current = video.currentTime;
      onTimeChange?.(video.currentTime);
    }

    function triggerCheckpoint(checkpoint: VideoCheckpoint) {
      triggeredCheckpointIdsRef.current.add(checkpoint.id);
      suppressSeekCheckRef.current = true;
      video.currentTime = checkpoint.timestampSeconds;
      previousTimeRef.current = checkpoint.timestampSeconds;
      void video.pause();
      onCheckpointCrossed?.(checkpoint);
    }

    function handleTimeUpdate() {
      const previousTime = previousTimeRef.current;
      const currentTime = video.currentTime;
      const checkpoint = findTriggeredCheckpoint(
        previousTime,
        currentTime,
        checkpoints,
        triggeredCheckpointIdsRef.current,
      );

      onTimeChange?.(currentTime);

      if (checkpoint) {
        triggerCheckpoint(checkpoint);
        return;
      }

      const now = Date.now();

      if (onProgress && shouldSaveVideoProgress(lastSavedAtRef.current, now, progressSaveIntervalSeconds)) {
        lastSavedAtRef.current = now;
        onProgress(Math.floor(currentTime));
      }

      previousTimeRef.current = currentTime;
    }

    function handleSeeking() {
      if (suppressSeekCheckRef.current) {
        suppressSeekCheckRef.current = false;
        return;
      }

      const checkpoint = findBlockedSeekCheckpoint(previousTimeRef.current, video.currentTime, checkpoints);

      if (checkpoint) {
        triggerCheckpoint(checkpoint);
      }
    }

    void attach();
    video.addEventListener('loadedmetadata', applyInitialPosition);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeking', handleSeeking);

    return () => {
      if (onProgress && video.currentTime > 0) {
        onProgress(Math.floor(video.currentTime));
      }

      destroyed = true;
      video.removeEventListener('loadedmetadata', applyInitialPosition);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeking', handleSeeking);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [
    checkpoints,
    initialPositionSeconds,
    onCheckpointCrossed,
    onProgress,
    onTimeChange,
    playbackUrl,
    progressSaveIntervalSeconds,
  ]);

  return <video ref={videoRef} className="aspect-video w-full rounded-md bg-black" controls playsInline />;
}
