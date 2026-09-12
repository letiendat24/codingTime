export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: readonly string[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
