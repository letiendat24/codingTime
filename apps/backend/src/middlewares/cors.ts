import type { NextFunction, Request, Response } from 'express';

export function cors(origin: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    response.header('Access-Control-Allow-Origin', origin);
    response.header('Access-Control-Allow-Credentials', 'true');
    response.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
    response.header(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,Range,If-None-Match,If-Match,Accept',
    );
    response.header(
      'Access-Control-Expose-Headers',
      'Content-Range,Accept-Ranges,ETag,Content-Length,Content-Type',
    );
    response.header('Vary', 'Origin');

    if (request.method === 'OPTIONS') {
      response.status(204).send();
      return;
    }

    next();
  };
}
