import {
  CourseStatus,
  EnrollmentStatus,
  VideoAssetStatus,
  VideoProcessingJobStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const videoInclude = {
  renditions: { orderBy: { height: 'asc' } },
  jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
  lesson: {
    include: {
      module: {
        include: {
          course: true,
        },
      },
    },
  },
} satisfies Prisma.VideoAssetInclude;

export type VideoAssetWithDetails = Prisma.VideoAssetGetPayload<{ include: typeof videoInclude }>;

export class VideoRepository {
  constructor(private readonly prisma: DatabaseClient) {}

  async findLessonWithCourse(lessonId: string) {
    return this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            course: true,
          },
        },
      },
    });
  }

  async createOrResetUploadIntent(input: {
    readonly videoAssetId: string;
    readonly lessonId: string;
    readonly instructorId: string;
    readonly originalFilename: string;
    readonly mimeType: string;
    readonly sizeBytes: bigint;
    readonly sourceObjectKey: string;
  }) {
    return this.prisma.videoAsset.upsert({
      where: { lessonId: input.lessonId },
      create: {
        id: input.videoAssetId,
        lessonId: input.lessonId,
        createdByUserId: input.instructorId,
        status: VideoAssetStatus.UPLOADING,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sourceObjectKey: input.sourceObjectKey,
      },
      update: {
        status: VideoAssetStatus.UPLOADING,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sourceObjectKey: input.sourceObjectKey,
        sourceObjectId: null,
        masterPlaylistObjectKey: null,
        thumbnailObjectKey: null,
        processingProgress: 0,
        durationSeconds: null,
        width: null,
        height: null,
        readyAt: null,
        failedAt: null,
        renditions: { deleteMany: {} },
      },
    });
  }

  async findVideoForInstructor(videoAssetId: string, instructorId: string) {
    return this.prisma.videoAsset.findFirst({
      where: {
        id: videoAssetId,
        lesson: {
          module: {
            course: {
              ownerInstructorId: instructorId,
            },
          },
        },
      },
      include: videoInclude,
    });
  }

  async findVideoById(videoAssetId: string) {
    return this.prisma.videoAsset.findUnique({
      where: { id: videoAssetId },
      include: videoInclude,
    });
  }

  async findVideoByLesson(lessonId: string) {
    return this.prisma.videoAsset.findUnique({
      where: { lessonId },
      include: videoInclude,
    });
  }

  async findLatestActiveJob(videoAssetId: string) {
    return this.prisma.videoProcessingJob.findFirst({
      where: {
        videoAssetId,
        status: { in: [VideoProcessingJobStatus.QUEUED, VideoProcessingJobStatus.PROCESSING] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStoredObject(input: {
    readonly bucket: string;
    readonly objectKey: string;
    readonly contentType: string;
    readonly sizeBytes: bigint;
    readonly etag?: string;
  }) {
    return this.prisma.storedObject.upsert({
      where: {
        bucket_objectKey: {
          bucket: input.bucket,
          objectKey: input.objectKey,
        },
      },
      create: {
        bucket: input.bucket,
        objectKey: input.objectKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        etag: input.etag ?? null,
      },
      update: {
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        etag: input.etag ?? null,
      },
    });
  }

  async markUploadedAndQueue(input: {
    readonly videoAssetId: string;
    readonly storedObjectId: string;
    readonly jobId: string;
  }) {
    await this.prisma.videoAsset.update({
      where: { id: input.videoAssetId },
      data: {
        status: VideoAssetStatus.QUEUED,
        sourceObjectId: input.storedObjectId,
        processingProgress: 0,
        failedAt: null,
      },
    });

    return this.prisma.videoProcessingJob.create({
      data: {
        videoAssetId: input.videoAssetId,
        jobId: input.jobId,
        status: VideoProcessingJobStatus.QUEUED,
      },
    });
  }

  async markStarted(input: { readonly videoAssetId: string; readonly jobId: string }) {
    await this.prisma.videoProcessingJob.updateMany({
      where: {
        jobId: input.jobId,
        status: { not: VideoProcessingJobStatus.COMPLETED },
      },
      data: {
        status: VideoProcessingJobStatus.PROCESSING,
        attemptCount: { increment: 1 },
        startedAt: new Date(),
      },
    });

    await this.prisma.videoAsset.updateMany({
      where: { id: input.videoAssetId, status: { not: VideoAssetStatus.READY } },
      data: { status: VideoAssetStatus.PROCESSING, processingProgress: 1 },
    });
  }

  async markProgress(input: { readonly videoAssetId: string; readonly jobId: string; readonly progressPercent: number }) {
    await this.prisma.videoProcessingJob.updateMany({
      where: { jobId: input.jobId, status: VideoProcessingJobStatus.PROCESSING },
      data: { progressPercent: input.progressPercent },
    });
    await this.prisma.videoAsset.updateMany({
      where: { id: input.videoAssetId, status: VideoAssetStatus.PROCESSING },
      data: { processingProgress: input.progressPercent },
    });
  }

  async markCompleted(input: {
    readonly videoAssetId: string;
    readonly jobId: string;
    readonly durationSeconds: number;
    readonly width: number;
    readonly height: number;
    readonly masterPlaylistObjectKey: string;
    readonly thumbnailObjectKey: string;
    readonly renditions: readonly {
      readonly quality: string;
      readonly width: number;
      readonly height: number;
      readonly bitrate: number;
      readonly playlistObjectKey: string;
    }[];
  }) {
    await this.prisma.videoProcessingJob.updateMany({
      where: { jobId: input.jobId },
      data: {
        status: VideoProcessingJobStatus.COMPLETED,
        progressPercent: 100,
        completedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    await this.prisma.videoAsset.update({
      where: { id: input.videoAssetId },
      data: {
        status: VideoAssetStatus.READY,
        processingProgress: 100,
        durationSeconds: input.durationSeconds,
        width: input.width,
        height: input.height,
        masterPlaylistObjectKey: input.masterPlaylistObjectKey,
        thumbnailObjectKey: input.thumbnailObjectKey,
        readyAt: new Date(),
        failedAt: null,
        renditions: {
          deleteMany: {},
          create: input.renditions.map((rendition) => ({
            quality: rendition.quality,
            width: rendition.width,
            height: rendition.height,
            bitrate: rendition.bitrate,
            playlistObjectKey: rendition.playlistObjectKey,
          })),
        },
      },
    });
  }

  async markFailed(input: {
    readonly videoAssetId: string;
    readonly jobId: string;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly retryable: boolean;
  }) {
    const job = await this.prisma.videoProcessingJob.update({
      where: { jobId: input.jobId },
      data: {
        status: VideoProcessingJobStatus.FAILED,
        failedAt: new Date(),
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
      },
    });

    await this.prisma.videoAsset.updateMany({
      where: { id: input.videoAssetId, status: { not: VideoAssetStatus.READY } },
      data: {
        status: VideoAssetStatus.FAILED,
        failedAt: new Date(),
        processingProgress: 0,
      },
    });

    await this.prisma.videoProcessingFailure.createMany({
      data: [{
        videoAssetId: input.videoAssetId,
        jobId: input.jobId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        retryable: input.retryable,
        attemptCount: job.attemptCount,
      }],
      skipDuplicates: true,
    });
  }

  async createRetryJob(input: { readonly videoAssetId: string; readonly jobId: string }) {
    await this.prisma.videoAsset.update({
      where: { id: input.videoAssetId },
      data: {
        status: VideoAssetStatus.QUEUED,
        processingProgress: 0,
        failedAt: null,
      },
    });

    return this.prisma.videoProcessingJob.create({
      data: {
        videoAssetId: input.videoAssetId,
        jobId: input.jobId,
        status: VideoProcessingJobStatus.QUEUED,
      },
    });
  }

  async findReadyVideoForEnrolledStudent(studentId: string, lessonId: string) {
    return this.prisma.videoAsset.findFirst({
      where: {
        lessonId,
        status: VideoAssetStatus.READY,
        lesson: {
          module: {
            course: {
              status: CourseStatus.PUBLISHED,
              enrollments: {
                some: {
                  studentId,
                  status: { not: EnrollmentStatus.CANCELLED },
                },
              },
            },
          },
        },
      },
    });
  }
}
