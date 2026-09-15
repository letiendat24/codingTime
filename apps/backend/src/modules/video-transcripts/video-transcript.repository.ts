import { CourseStatus, EnrollmentStatus, TranscriptSource, TranscriptStatus, VideoAssetStatus, type Prisma, type PrismaClient } from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export const transcriptInclude = {
  segments: { orderBy: [{ startTimeMs: 'asc' }, { order: 'asc' }] },
  videoAsset: {
    include: {
      lesson: { include: { module: { include: { course: true } } } },
    },
  },
} as const satisfies Prisma.VideoTranscriptInclude;

export type VideoTranscriptWithSegments = Prisma.VideoTranscriptGetPayload<{ include: typeof transcriptInclude }>;

export class VideoTranscriptRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findVideoForInstructor(instructorId: string, videoAssetId: string) {
    return this.prisma.videoAsset.findFirst({
      where: {
        id: videoAssetId,
        lesson: { module: { course: { ownerInstructorId: instructorId } } },
      },
      include: { lesson: { include: { module: { include: { course: true } } } } },
    });
  }

  async findReadyVideoByLessonForStudent(studentId: string, lessonId: string) {
    return this.prisma.videoAsset.findFirst({
      where: {
        lessonId,
        status: VideoAssetStatus.READY,
        lesson: {
          module: {
            course: {
              status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
              enrollments: { some: { studentId, status: { not: EnrollmentStatus.CANCELLED } } },
            },
          },
        },
      },
    });
  }

  async listForInstructor(instructorId: string, videoAssetId: string) {
    return this.prisma.videoTranscript.findMany({
      where: { videoAssetId, videoAsset: { lesson: { module: { course: { ownerInstructorId: instructorId } } } } },
      include: { segments: true },
      orderBy: [{ language: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findForInstructor(instructorId: string, videoAssetId: string, transcriptId: string) {
    return this.prisma.videoTranscript.findFirst({
      where: {
        id: transcriptId,
        videoAssetId,
        videoAsset: { lesson: { module: { course: { ownerInstructorId: instructorId } } } },
      },
      include: transcriptInclude,
    });
  }

  async listReadyForStudent(studentId: string, lessonId: string) {
    return this.prisma.videoTranscript.findMany({
      where: {
        status: TranscriptStatus.READY,
        videoAsset: {
          lessonId,
          status: VideoAssetStatus.READY,
          lesson: {
            module: {
              course: {
                status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
                enrollments: { some: { studentId, status: { not: EnrollmentStatus.CANCELLED } } },
              },
            },
          },
        },
      },
      include: { segments: true },
      orderBy: [{ language: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findReadyForStudent(studentId: string, lessonId: string, transcriptId: string) {
    return this.prisma.videoTranscript.findFirst({
      where: {
        id: transcriptId,
        status: TranscriptStatus.READY,
        videoAsset: {
          lessonId,
          status: VideoAssetStatus.READY,
          lesson: {
            module: {
              course: {
                status: { in: [CourseStatus.PUBLISHED, CourseStatus.ARCHIVED] },
                enrollments: { some: { studentId, status: { not: EnrollmentStatus.CANCELLED } } },
              },
            },
          },
        },
      },
      include: transcriptInclude,
    });
  }

  async upsertTranscript(input: {
    readonly videoAssetId: string;
    readonly language: string;
    readonly source: TranscriptSource;
    readonly status: TranscriptStatus;
    readonly title: string | null;
    readonly segments: readonly { readonly order: number; readonly startTimeMs: number; readonly endTimeMs: number; readonly text: string }[];
  }): Promise<VideoTranscriptWithSegments> {
    const existing = await this.prisma.videoTranscript.findUnique({
      where: { videoAssetId_language: { videoAssetId: input.videoAssetId, language: input.language } },
    });

    if (!existing) {
      return this.prisma.videoTranscript.create({
        data: {
          videoAssetId: input.videoAssetId,
          language: input.language,
          source: input.source,
          status: input.status,
          title: input.title,
          segments: { create: [...input.segments] },
        },
        include: transcriptInclude,
      });
    }

    await this.prisma.videoTranscriptSegment.deleteMany({ where: { transcriptId: existing.id } });
    return this.prisma.videoTranscript.update({
      where: { id: existing.id },
      data: {
        source: input.source,
        status: input.status,
        title: input.title,
        segments: { create: [...input.segments] },
      },
      include: transcriptInclude,
    });
  }

  async updateTranscript(input: {
    readonly transcriptId: string;
    readonly language?: string;
    readonly title?: string | null;
    readonly status?: TranscriptStatus;
    readonly segments?: readonly { readonly order: number; readonly startTimeMs: number; readonly endTimeMs: number; readonly text: string }[];
  }): Promise<VideoTranscriptWithSegments> {
    if (input.segments) {
      await this.prisma.videoTranscriptSegment.deleteMany({ where: { transcriptId: input.transcriptId } });
    }

    return this.prisma.videoTranscript.update({
      where: { id: input.transcriptId },
      data: {
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.segments !== undefined ? { segments: { create: [...input.segments] } } : {}),
      },
      include: transcriptInclude,
    });
  }

  async deleteTranscript(transcriptId: string) {
    await this.prisma.videoTranscript.delete({ where: { id: transcriptId } });
  }
}
