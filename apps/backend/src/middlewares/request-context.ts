import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppLogger } from '../shared/logger';

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';

function isValidRequestId(value: string) {
  return /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
}

export function requestContext(logger: AppLogger) {
  return (request: Request, response: Response, next: NextFunction) => {
    const incomingRequestId = request.header(CORRELATION_ID_HEADER) ?? request.header(REQUEST_ID_HEADER);
    const trimmedRequestId = incomingRequestId?.trim();
    const requestId = trimmedRequestId && isValidRequestId(trimmedRequestId) ? trimmedRequestId : randomUUID();

    request.requestId = requestId;
    request.log = logger.child({ requestId });
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.setHeader(CORRELATION_ID_HEADER, requestId);

    next();
  };
}
