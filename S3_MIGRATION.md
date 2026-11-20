# Private S3 video storage switch

The current backend signs instructor upload intents and validates the uploaded object's size before queueing video work. The browser sends one PUT with `Content-Type` and then calls `complete-upload`. The worker receives only an object key in RabbitMQ, downloads to a temporary file, runs FFmpeg, uploads HLS playlists, segments and thumbnail, and publishes a result event. Backend consumers own the database status. Student and instructor HLS requests are authorized and streamed through the backend, including nested playlists and byte-range segment requests. No new AWS playback service or public bucket is needed.

## Configuration

- Local MinIO: `STORAGE_PROVIDER=minio`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_PUBLIC_ENDPOINT`.
- S3: `STORAGE_PROVIDER=s3`, `AWS_REGION=ap-southeast-2`, `AWS_S3_BUCKET=codingtime-video-storage-2026`. On a developer host, `AWS_PROFILE=codingtime-s3` uses the AWS default credential chain. In production containers, inject `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` through a protected runtime environment file or use an instance role. Never put credentials in frontend variables or Git.
- The private bucket must allow the service principal `s3:ListBucket` on the bucket and `s3:GetObject`, `s3:PutObject` on `videos/*`. `HeadBucket` readiness needs `ListBucket`. Multipart migration and worker uploads should also allow `s3:AbortMultipartUpload` on `videos/*` so failed uploads can be cleaned up. Browser CORS must allow production and localhost origins, `PUT`, and `Content-Type`. Preserve Block Public Access.

If CORS needs adjustment, use a rule like this with the exact deployed origin:

```json
[{"AllowedOrigins":["https://codingtime.click","http://localhost:3000"],"AllowedMethods":["PUT"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":3000}]
```

The production Compose files retain the MinIO service and volume for rollback and migration, but backend and video worker no longer wait for MinIO when S3 is selected. Nginx's existing storage subdomain remains available only for MinIO rollback; S3 upload URLs point directly to S3. No Nginx change is required for private HLS playback.

## Copy and verify

Keep both stores and the database intact. Set `MINIO_ENDPOINT` to an address reachable from the machine running the tool (for example localhost through the existing bound MinIO port); `MINIO_USE_SSL=true` is available for an HTTPS source. From the backend package, first inspect one video using `pnpm exec tsx src/infrastructure/storage/migrate-minio-to-s3.ts --prefix=videos/processed/<video-id>/`. Then pass `--execute` to copy that prefix. The tool preserves keys, content types and custom metadata, skips matching size/type objects, checks each copied size, and reports source and target counts and bytes for the prefix. Repeat for that video's source prefix, then check the master playlist, rendition playlists, segments and thumbnail through the authenticated API. Run broader prefixes only after reviewing the one-video results and approving the production bulk copy. Do not remove MinIO or its volume during the switch.

Before flipping `STORAGE_PROVIDER` in production, compare source and target object counts and total bytes for `videos/`, spot-check key metadata and playback, and plan a short write pause or final incremental pass so new uploads are not missed. Existing `StoredObject.bucket` values still name the original bucket; object keys and IDs remain unchanged. Revert the provider variable to MinIO if the S3 check fails. S3 transfer and request charges apply to copied data and each proxied playback request.

## Validation

Run test, lint, typecheck and build. With the configured profile, exercise a small presigned PUT, HEAD and GET, then a real instructor upload and complete-upload flow, RabbitMQ processing, HLS playback including child playlists and segments, and Code-Along/Follow/Practice screens. The integration tests use storage mocks and cannot prove AWS connectivity or browser CORS. A production switch and bulk copy are separate manual operations.
