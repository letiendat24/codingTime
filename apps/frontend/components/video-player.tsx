'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, Check, RefreshCw, Settings } from 'lucide-react';
import Hls from 'hls.js';
import {
  findBlockedSeekCheckpoint,
  findTriggeredCheckpoint,
  resolvePlaybackUrl,
  shouldSaveVideoProgress,
} from '../lib/video-learning';
import { getAccessToken } from '../lib/api/client';
import type { VideoCheckpoint } from '../lib/api';
import {
  VIDEO_QUALITY_PREFERENCE_KEY,
  applyVideoQuality,
  buildVideoQualityOptions,
  currentAutoQualityLabel,
  findQualityByPreference,
  preferenceFromQuality,
  type VideoQuality,
  type VideoQualityOption,
  type VideoQualityPreference,
} from '../lib/video-quality';

interface VideoPlayerProps {
  readonly playbackUrl: string;
  readonly initialPositionSeconds?: number | undefined;
  readonly checkpoints?: readonly VideoCheckpoint[] | undefined;
  readonly progressSaveIntervalSeconds?: number | undefined;
  readonly onCheckpointCrossed?: ((checkpoint: VideoCheckpoint) => void) | undefined;
  readonly onProgress?: ((positionSeconds: number) => void) | undefined;
  readonly onTimeChange?: ((positionSeconds: number) => void) | undefined;
  readonly seekToSeconds?: number | null | undefined;
  readonly subtitleText?: string | null | undefined;
  readonly pauseSignal?: number | undefined;
  readonly resumeSignal?: number | undefined;
  readonly playbackBlocked?: boolean | undefined;
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
  subtitleText,
  pauseSignal,
  resumeSignal,
  playbackBlocked = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previousTimeRef = useRef(initialPositionSeconds);
  const lastSavedAtRef = useRef(0);
  const lastSavedPositionRef = useRef(initialPositionSeconds);
  const triggeredCheckpointIdsRef = useRef(new Set<string>());
  const suppressSeekCheckRef = useRef(false);
  const hlsRef = useRef<Hls | null>(null);

  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [qualityOptions, setQualityOptions] = useState<readonly VideoQualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>({ mode: 'AUTO' });
  const [effectiveLevelIndex, setEffectiveLevelIndex] = useState<number | null>(null);

  const checkpointsRef = useRef(checkpoints);
  const onCheckpointCrossedRef = useRef(onCheckpointCrossed);
  const onProgressRef = useRef(onProgress);
  const onTimeChangeRef = useRef(onTimeChange);
  const progressSaveIntervalRef = useRef(progressSaveIntervalSeconds);
  const playbackBlockedRef = useRef(playbackBlocked);

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
    playbackBlockedRef.current = playbackBlocked;
    if (playbackBlocked) {
      void videoRef.current?.pause();
    }
  }, [playbackBlocked]);

  useEffect(() => {
    previousTimeRef.current = initialPositionSeconds;
    lastSavedPositionRef.current = initialPositionSeconds;
    lastSavedAtRef.current = 0;
    triggeredCheckpointIdsRef.current = new Set();
    setPlaybackError(null);
    setQualityMenuOpen(false);
    setQualityOptions([]);
    setSelectedQuality({ mode: 'AUTO' });
    setEffectiveLevelIndex(null);
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

  useEffect(() => {
    if (!pauseSignal) {
      return;
    }

    void videoRef.current?.pause();
  }, [pauseSignal]);

  useEffect(() => {
    if (!resumeSignal) {
      return;
    }

    void videoRef.current?.play().catch(() => {
      // Browser autoplay policies may still require a direct user gesture.
    });
  }, [resumeSignal]);

  const handleRetry = useCallback(() => {
    setPlaybackError(null);
    setRetryCount((prev) => prev + 1);
  }, []);

  const handleSelectQuality = useCallback((quality: VideoQuality) => {
    const hls = hlsRef.current;
    if (!hls) {
      return;
    }

    applyVideoQuality(hls, quality);
    setSelectedQuality(quality);
    setQualityMenuOpen(false);

    try {
      window.localStorage.setItem(VIDEO_QUALITY_PREFERENCE_KEY, preferenceFromQuality(quality));
    } catch {
      // Local preference persistence is best-effort.
    }
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

      player.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) {
          return;
        }

        const options = buildVideoQualityOptions(player.levels);
        setQualityOptions(options);

        let savedPreference: VideoQualityPreference | null = null;
        try {
          const stored = window.localStorage.getItem(VIDEO_QUALITY_PREFERENCE_KEY);
          savedPreference = stored === 'AUTO' || /^\d+$/.test(stored ?? '') ? (stored as VideoQualityPreference) : null;
        } catch {
          savedPreference = null;
        }

        const restoredQuality = findQualityByPreference(options, savedPreference);
        applyVideoQuality(player, restoredQuality);
        setSelectedQuality(restoredQuality);
      });

      player.on(Hls.Events.LEVEL_SWITCHING, (_event, data) => {
        if (!destroyed) {
          setEffectiveLevelIndex(data.level);
        }
      });

      player.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (!destroyed) {
          setEffectiveLevelIndex(data.level);
        }
      });

      player.loadSource(resolvedUrl);
      player.attachMedia(video);
      hls = player;
      hlsRef.current = player;
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

    function handlePlay() {
      if (playbackBlockedRef.current) {
        void video.pause();
      }
    }

    video.addEventListener('loadedmetadata', applyInitialPosition);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('error', handleVideoError);
    video.addEventListener('play', handlePlay);

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
      video.removeEventListener('play', handlePlay);
      if (hls) {
        hls.destroy();
        if (hlsRef.current === hls) {
          hlsRef.current = null;
        }
      } else {
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [initialPositionSeconds, playbackUrl, retryCount]);

  const effectiveQualityLabel = currentAutoQualityLabel(qualityOptions, effectiveLevelIndex);
  const selectedQualityLabel =
    selectedQuality.mode === 'AUTO'
      ? effectiveQualityLabel
        ? `Auto · ${effectiveQualityLabel}`
        : 'Auto'
      : `${selectedQuality.height}p`;
  const showQualitySelector = qualityOptions.length > 0;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        controls
        playsInline
      />

      {showQualitySelector ? (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={qualityMenuOpen}
            aria-label={`Video quality: ${selectedQualityLabel}`}
            onClick={() => setQualityMenuOpen((value) => !value)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-black/70 px-2.5 text-[11px] font-semibold text-white shadow-sm backdrop-blur transition-colors hover:bg-black/85 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>{selectedQualityLabel}</span>
          </button>

          {qualityMenuOpen ? (
            <div
              role="menu"
              aria-label="Video quality"
              className="absolute right-0 mt-2 w-36 rounded-md border border-white/15 bg-black/90 p-1 text-white shadow-lg backdrop-blur"
            >
              <QualityMenuItem
                label={effectiveQualityLabel ? `Auto · ${effectiveQualityLabel}` : 'Auto'}
                selected={selectedQuality.mode === 'AUTO'}
                onSelect={() => handleSelectQuality({ mode: 'AUTO' })}
              />
              {qualityOptions.map((option) => (
                <QualityMenuItem
                  key={`${option.height}-${option.levelIndex}`}
                  label={option.label}
                  selected={selectedQuality.mode === 'MANUAL' && selectedQuality.height === option.height}
                  onSelect={() =>
                    handleSelectQuality(
                      option.bitrate === undefined
                        ? {
                            mode: 'MANUAL',
                            levelIndex: option.levelIndex,
                            height: option.height,
                          }
                        : {
                            mode: 'MANUAL',
                            levelIndex: option.levelIndex,
                            height: option.height,
                            bitrate: option.bitrate,
                          },
                    )
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {subtitleText ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-12 flex justify-center sm:bottom-14">
          <p className="max-w-3xl rounded-md bg-black/75 px-3 py-1.5 text-center text-sm font-medium leading-6 text-white shadow-lg sm:text-base">
            {subtitleText}
          </p>
        </div>
      ) : null}

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

interface QualityMenuItemProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function QualityMenuItem({ label, selected, onSelect }: QualityMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60"
    >
      <span>{label}</span>
      {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <span className="h-3.5 w-3.5" />}
    </button>
  );
}
