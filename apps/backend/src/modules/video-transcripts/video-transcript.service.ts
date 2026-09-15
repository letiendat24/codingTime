import { TranscriptSource, TranscriptStatus, type PrismaClient, type VideoTranscriptSegment } from '@prisma/client';
import { videoLearningNotAccessible } from '../video-learning/video-learning.errors';
import { parseTranscriptFile } from './transcript-parser';
import { transcriptAccessDenied, transcriptNotFound, transcriptValidationFailed } from './video-transcript.errors';
import { VideoTranscriptRepository, type VideoTranscriptWithSegments } from './video-transcript.repository';
import type { ImportTranscriptInput, ManualTranscriptInput, TranscriptSegmentInput, UpdateTranscriptInput } from './video-transcript.schemas';

const DURATION_TOLERANCE_MS = 2_000;

function normalizeLanguage(language: string) {
  return language.trim().toLowerCase();
}

function normalizeSegments(segments: readonly TranscriptSegmentInput[], durationSeconds: number | null | undefined) {
  const errors: string[] = [];
  const durationMs = durationSeconds ? durationSeconds * 1000 : null;

  const normalized = segments
    .map((segment, index) => ({
      originalIndex: index,
      startTimeMs: Math.floor(segment.startTimeMs),
      endTimeMs: Math.floor(segment.endTimeMs),
      text: segment.text.trim(),
    }))
    .sort((left, right) => left.startTimeMs - right.startTimeMs || left.endTimeMs - right.endTimeMs || left.originalIndex - right.originalIndex);

  for (const segment of normalized) {
    if (segment.startTimeMs < 0) {
      errors.push('Segment start time must be non-negative');
    }
    if (segment.endTimeMs <= segment.startTimeMs) {
      errors.push('Segment end time must be after start time');
    }
    if (!segment.text) {
      errors.push('Segment text is required');
    }
    if (durationMs !== null && segment.startTimeMs > durationMs + DURATION_TOLERANCE_MS) {
      errors.push('Segment start time exceeds video duration');
    }
    if (durationMs !== null && segment.endTimeMs > durationMs + DURATION_TOLERANCE_MS) {
      errors.push('Segment end time exceeds video duration');
    }
  }

  if (normalized.length === 0) {
    errors.push('Transcript must contain at least one segment');
  }

  if (errors.length > 0) {
    throw transcriptValidationFailed([...new Set(errors)]);
  }

  return normalized.map((segment, index) => ({
    order: index + 1,
    startTimeMs: segment.startTimeMs,
    endTimeMs: segment.endTimeMs,
    text: segment.text,
  }));
}

function mapSegment(segment: Pick<VideoTranscriptSegment, 'id' | 'order' | 'startTimeMs' | 'endTimeMs' | 'text'>) {
  return {
    id: segment.id,
    order: segment.order,
    startTimeMs: segment.startTimeMs,
    endTimeMs: segment.endTimeMs,
    text: segment.text,
  };
}

function mapInstructorTranscript(transcript: VideoTranscriptWithSegments | {
  readonly id: string;
  readonly videoAssetId: string;
  readonly language: string;
  readonly source: TranscriptSource;
  readonly status: TranscriptStatus;
  readonly title: string | null;
  readonly segments: readonly Pick<VideoTranscriptSegment, 'id' | 'order' | 'startTimeMs' | 'endTimeMs' | 'text'>[];
}) {
  return {
    id: transcript.id,
    videoAssetId: transcript.videoAssetId,
    language: transcript.language,
    source: transcript.source,
    status: transcript.status,
    title: transcript.title,
    segmentCount: transcript.segments.length,
    segments: transcript.segments.map(mapSegment),
  };
}

function mapStudentTrack(transcript: {
  readonly id: string;
  readonly language: string;
  readonly title: string | null;
  readonly status: TranscriptStatus;
  readonly segments: readonly unknown[];
}) {
  return {
    id: transcript.id,
    language: transcript.language,
    title: transcript.title,
    status: transcript.status,
    segmentCount: transcript.segments.length,
  };
}

function mapStudentTranscript(transcript: VideoTranscriptWithSegments) {
  return {
    id: transcript.id,
    language: transcript.language,
    title: transcript.title,
    segments: transcript.segments.map((segment) => ({
      id: segment.id,
      startTimeMs: segment.startTimeMs,
      endTimeMs: segment.endTimeMs,
      text: segment.text,
    })),
  };
}

export class VideoTranscriptService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly transcripts: VideoTranscriptRepository,
  ) {}

  async listInstructorTranscripts(instructorId: string, videoAssetId: string) {
    const video = await this.transcripts.findVideoForInstructor(instructorId, videoAssetId);
    if (!video) {
      throw transcriptAccessDenied();
    }

    return {
      transcripts: (await this.transcripts.listForInstructor(instructorId, videoAssetId)).map(mapInstructorTranscript),
    };
  }

  async getInstructorTranscript(instructorId: string, videoAssetId: string, transcriptId: string) {
    const transcript = await this.transcripts.findForInstructor(instructorId, videoAssetId, transcriptId);
    if (!transcript) {
      throw transcriptNotFound();
    }
    return { transcript: mapInstructorTranscript(transcript) };
  }

  async createManualTranscript(instructorId: string, videoAssetId: string, input: ManualTranscriptInput) {
    const video = await this.transcripts.findVideoForInstructor(instructorId, videoAssetId);
    if (!video) {
      throw transcriptAccessDenied();
    }

    const transcript = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoTranscriptRepository(transaction);
      return repository.upsertTranscript({
        videoAssetId,
        language: normalizeLanguage(input.language),
        source: TranscriptSource.MANUAL,
        status: input.status,
        title: input.title ?? null,
        segments: normalizeSegments(input.segments, video.durationSeconds),
      });
    });

    return { transcript: mapInstructorTranscript(transcript) };
  }

  async importTranscript(instructorId: string, videoAssetId: string, input: ImportTranscriptInput) {
    const video = await this.transcripts.findVideoForInstructor(instructorId, videoAssetId);
    if (!video) {
      throw transcriptAccessDenied();
    }

    const parsed = parseTranscriptFile(input.filename, input.content);
    const transcript = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoTranscriptRepository(transaction);
      return repository.upsertTranscript({
        videoAssetId,
        language: normalizeLanguage(input.language),
        source: TranscriptSource.FILE_UPLOAD,
        status: TranscriptStatus.READY,
        title: input.title ?? null,
        segments: normalizeSegments(parsed, video.durationSeconds),
      });
    });

    return { transcript: mapInstructorTranscript(transcript) };
  }

  async updateTranscript(instructorId: string, videoAssetId: string, transcriptId: string, input: UpdateTranscriptInput) {
    const existing = await this.transcripts.findForInstructor(instructorId, videoAssetId, transcriptId);
    if (!existing) {
      throw transcriptNotFound();
    }

    const transcript = await this.prisma.$transaction(async (transaction) => {
      const repository = new VideoTranscriptRepository(transaction);
      return repository.updateTranscript({
        transcriptId,
        ...(input.language !== undefined ? { language: normalizeLanguage(input.language) } : {}),
        ...(input.title !== undefined ? { title: input.title ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.segments !== undefined ? { segments: normalizeSegments(input.segments, existing.videoAsset.durationSeconds) } : {}),
      });
    });

    return { transcript: mapInstructorTranscript(transcript) };
  }

  async deleteTranscript(instructorId: string, videoAssetId: string, transcriptId: string) {
    const transcript = await this.transcripts.findForInstructor(instructorId, videoAssetId, transcriptId);
    if (!transcript) {
      throw transcriptNotFound();
    }

    await this.transcripts.deleteTranscript(transcript.id);
  }

  async listStudentTranscripts(studentId: string, lessonId: string) {
    const video = await this.transcripts.findReadyVideoByLessonForStudent(studentId, lessonId);
    if (!video) {
      throw videoLearningNotAccessible();
    }

    return {
      transcripts: (await this.transcripts.listReadyForStudent(studentId, lessonId)).map(mapStudentTrack),
    };
  }

  async getStudentTranscript(studentId: string, lessonId: string, transcriptId: string) {
    const transcript = await this.transcripts.findReadyForStudent(studentId, lessonId, transcriptId);
    if (!transcript) {
      throw transcriptNotFound();
    }
    return { transcript: mapStudentTranscript(transcript) };
  }
}
