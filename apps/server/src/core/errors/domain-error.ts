export abstract class DomainError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly errorCode: string;

  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends DomainError {
  public readonly statusCode = 404;
  public readonly errorCode = 'NOT_FOUND';
}

export class UnauthorizedError extends DomainError {
  public readonly statusCode = 401;
  public readonly errorCode = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  public readonly statusCode = 403;
  public readonly errorCode = 'FORBIDDEN';
}

export class ConflictError extends DomainError {
  public readonly statusCode = 409;
  public readonly errorCode = 'CONFLICT';
}

export class ValidationError extends DomainError {
  public readonly statusCode = 422;
  public readonly errorCode = 'VALIDATION_FAILED';
}

export class GroupLimitExceededError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'GROUP_LIMIT_EXCEEDED';
}

export class EditWindowExpiredError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'EDIT_WINDOW_EXPIRED';
}

export class DeleteWindowExpiredError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'DELETE_WINDOW_EXPIRED';
}

export class AttachmentTooLargeError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'ATTACHMENT_TOO_LARGE';
}

export class UnsupportedFileTypeError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'UNSUPPORTED_FILE_TYPE';
}

export class AttachmentDeletedError extends DomainError {
  public readonly statusCode = 410;
  public readonly errorCode = 'ATTACHMENT_DELETED';
}

export class InternalServerError extends DomainError {
  public readonly statusCode = 500;
  public readonly errorCode = 'INTERNAL_SERVER_ERROR';
}

