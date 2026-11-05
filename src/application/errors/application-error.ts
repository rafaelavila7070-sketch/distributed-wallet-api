export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message = code,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
