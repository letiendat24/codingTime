import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../shared/http-error';

interface ErrorResponseBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly string[];
    readonly requestId?: string;
    readonly stack?: string;
  };
}

export function errorHandler(_environment: string): ErrorRequestHandler {
  return (error, request, response, _next) => {
    const isValidationError = error instanceof ZodError;
    const statusCode = isValidationError ? 400 : error instanceof HttpError ? error.statusCode : 500;
    const code = isValidationError
      ? 'VALIDATION_ERROR'
      : error instanceof HttpError
        ? error.code
        : 'INTERNAL_SERVER_ERROR';
    const message = isValidationError
      ? 'Invalid request'
      : error instanceof Error
        ? error.message
        : 'Unexpected error';

    request.log.error({ error, statusCode }, message);

    const body: ErrorResponseBody = {
      error: {
        code,
        message: statusCode >= 500 ? 'Internal server error' : message,
        ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
        requestId: request.requestId,
      },
    };

    response.status(statusCode).json(body);
  };
}
