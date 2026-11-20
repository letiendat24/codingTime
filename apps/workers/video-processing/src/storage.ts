import { createReadStream } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { Client } from 'minio';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { WorkerEnv } from './config';

type StorageClient = Client | S3Client;

export function storageBucket(env: WorkerEnv): string {
  return (env.STORAGE_PROVIDER === 's3' ? env.AWS_S3_BUCKET : env.MINIO_BUCKET)!;
}

export function createStorageClient(env: WorkerEnv): StorageClient {
  if (env.STORAGE_PROVIDER === 's3') return new S3Client({ region: env.AWS_REGION! });
  return new Client({
    endPoint: env.MINIO_ENDPOINT!,
    port: env.MINIO_PORT,
    useSSL: false,
    accessKey: env.MINIO_ACCESS_KEY!,
    secretKey: env.MINIO_SECRET_KEY!,
  });
}

export async function downloadObject(input: {
  readonly storage: StorageClient;
  readonly bucket: string;
  readonly objectKey: string;
  readonly targetPath: string;
}) {
  if (input.storage instanceof S3Client) {
    const result = await input.storage.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.objectKey }));
    if (!result.Body) throw new Error('S3 object has no response body');
    await pipeline(result.Body as Readable, createWriteStream(input.targetPath));
  } else {
    await input.storage.fGetObject(input.bucket, input.objectKey, input.targetPath);
  }
}

function contentTypeFor(path: string) {
  if (path.endsWith('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  }

  if (path.endsWith('.ts')) {
    return 'video/mp2t';
  }

  if (path.endsWith('.m4s')) return 'video/iso.segment';
  if (path.endsWith('.mp4')) return 'video/mp4';

  if (path.endsWith('.jpg')) {
    return 'image/jpeg';
  }

  return 'application/octet-stream';
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function uploadDirectory(input: {
  readonly storage: StorageClient;
  readonly bucket: string;
  readonly directory: string;
  readonly objectPrefix: string;
}) {
  const files = await listFiles(input.directory);

  for (const file of files) {
    const objectKey = `${input.objectPrefix}/${relative(input.directory, file).replaceAll('\\', '/')}`;
    if (input.storage instanceof S3Client) {
      await new Upload({ client: input.storage, params: {
        Bucket: input.bucket, Key: objectKey, Body: createReadStream(file), ContentType: contentTypeFor(file),
      } }).done();
    } else {
      await input.storage.putObject(input.bucket, objectKey, createReadStream(file), undefined, {
        'Content-Type': contentTypeFor(file),
      });
    }
  }
}
