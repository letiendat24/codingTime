import { HttpError } from '../../shared/http-error';

export function videoLessonNotFound() {
  return new HttpError(404, 'VIDEO_LESSON_NOT_FOUND', 'Lesson not found');
}

export function videoAccessDenied() {
  return new HttpError(404, 'VIDEO_NOT_FOUND', 'Video not found');
}

export function videoLessonTypeInvalid() {
  return new HttpError(409, 'VIDEO_LESSON_TYPE_INVALID', 'Only VIDEO lessons can have video assets');
}

export function videoContentTypeInvalid() {
  return new HttpError(400, 'VIDEO_CONTENT_TYPE_INVALID', 'Unsupported video content type');
}

export function videoUploadTooLarge() {
  return new HttpError(413, 'VIDEO_UPLOAD_TOO_LARGE', 'Video upload exceeds configured limit');
}

export function videoObjectMissing() {
  return new HttpError(409, 'VIDEO_OBJECT_MISSING', 'Uploaded object was not found in object storage');
}

export function videoObjectMetadataMismatch() {
  return new HttpError(409, 'VIDEO_OBJECT_METADATA_MISMATCH', 'Uploaded object metadata does not match upload intent');
}

export function videoRetryNotAllowed() {
  return new HttpError(409, 'VIDEO_RETRY_NOT_ALLOWED', 'Only failed videos can be retried');
}

export function videoPlaybackNotReady() {
  return new HttpError(409, 'VIDEO_PLAYBACK_NOT_READY', 'Video is not ready for playback');
}
