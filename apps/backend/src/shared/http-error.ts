export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: readonly string[],
    public readonly issues?: readonly unknown[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
