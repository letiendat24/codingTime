import { HttpError } from '../../shared/http-error';

export function transcriptNotFound() {
  return new HttpError(404, 'TRANSCRIPT_NOT_FOUND', 'Transcript not found');
}

export function transcriptAccessDenied() {
  return new HttpError(404, 'TRANSCRIPT_NOT_FOUND', 'Transcript not found');
}

export function transcriptValidationFailed(details: readonly string[]) {
  return new HttpError(422, 'TRANSCRIPT_VALIDATION_FAILED', 'Transcript is invalid', details);
}

export function transcriptFormatUnsupported() {
  return new HttpError(400, 'TRANSCRIPT_FORMAT_UNSUPPORTED', 'Only SRT and WebVTT transcript files are supported');
}
