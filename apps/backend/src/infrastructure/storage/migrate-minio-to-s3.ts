import { Client } from 'minio';
import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// Run from the backend package with tsx. This tool never deletes source objects.
const prefix = process.argv.find((arg) => arg.startsWith('--prefix='))?.slice('--prefix='.length);
const execute = process.argv.includes('--execute');
if (!prefix || !prefix.startsWith('videos/') || prefix.includes('..')) {
  throw new Error('Supply --prefix=videos/... to limit the migration scope');
}

const sourceBucket = process.env.MINIO_BUCKET;
const targetBucket = process.env.AWS_S3_BUCKET;
const region = process.env.AWS_REGION;
if (!sourceBucket || !targetBucket || !region || !process.env.MINIO_ENDPOINT ||
    !process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
  throw new Error('Missing MinIO source or AWS S3 target configuration');
}

const source = new Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: Number(process.env.MINIO_PORT ?? '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
const target = new S3Client({ region });
let objects = 0;
let bytes = 0;
let copied = 0;
let skipped = 0;

async function main() {
  for await (const object of source.listObjectsV2(sourceBucket!, prefix!, true)) {
    if (!object.name) continue;
    const key = object.name;
    const stat = await source.statObject(sourceBucket!, key);
    const metadata = Object.fromEntries(Object.entries(stat.metaData ?? {})
      .filter(([name]) => name.toLowerCase().startsWith('x-amz-meta-'))
      .map(([name, value]) => [name.slice('x-amz-meta-'.length), value]));
    objects += 1;
    bytes += stat.size;
    if (!execute) {
      console.log(`PLAN ${key} ${stat.size}`);
      continue;
    }

    try {
      const existing = await target.send(new HeadObjectCommand({ Bucket: targetBucket, Key: key }));
      if (existing.ContentLength === stat.size &&
          existing.ContentType === (stat.metaData?.['content-type'] ?? 'application/octet-stream') &&
          Object.entries(metadata).every(([name, value]) => existing.Metadata?.[name] === value)) {
        skipped += 1;
        console.log(`SKIP ${key}`);
        continue;
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'NotFound') throw error;
    }

    await new Upload({
      client: target,
      params: {
        Bucket: targetBucket,
        Key: key,
        Body: await source.getObject(sourceBucket!, key),
        ContentType: stat.metaData?.['content-type'] ?? 'application/octet-stream',
        CacheControl: stat.metaData?.['cache-control'],
        Metadata: metadata,
      },
    }).done();
    const verified = await target.send(new HeadObjectCommand({ Bucket: targetBucket, Key: key }));
    if (verified.ContentLength !== stat.size) throw new Error(`Size mismatch after copy: ${key}`);
    copied += 1;
    console.log(`COPIED ${key} ${stat.size}`);
  }

  let targetObjects = 0;
  let targetBytes = 0;
  let continuationToken: string | undefined;
  do {
    const page = await target.send(new ListObjectsV2Command({
      Bucket: targetBucket, Prefix: prefix, ContinuationToken: continuationToken,
    }));
    for (const item of page.Contents ?? []) {
      targetObjects += 1;
      targetBytes += item.Size ?? 0;
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  console.log(JSON.stringify({ prefix, execute, sourceObjects: objects, sourceBytes: bytes, targetObjects, targetBytes, copied, skipped }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
