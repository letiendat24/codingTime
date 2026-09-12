import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Client } from 'minio';
import type { WorkerEnv } from './config';

export function createStorageClient(env: WorkerEnv) {
  return new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: false,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });
}

export async function downloadObject(input: {
  readonly storage: Client;
  readonly bucket: string;
  readonly objectKey: string;
  readonly targetPath: string;
}) {
  await input.storage.fGetObject(input.bucket, input.objectKey, input.targetPath);
}

function contentTypeFor(path: string) {
  if (path.endsWith('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  }

  if (path.endsWith('.ts')) {
    return 'video/mp2t';
  }

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
  readonly storage: Client;
  readonly bucket: string;
  readonly directory: string;
  readonly objectPrefix: string;
}) {
  const files = await listFiles(input.directory);

  for (const file of files) {
    const objectKey = `${input.objectPrefix}/${relative(input.directory, file).replaceAll('\\', '/')}`;
    await input.storage.putObject(input.bucket, objectKey, createReadStream(file), undefined, {
      'Content-Type': contentTypeFor(file),
    });
  }
}
