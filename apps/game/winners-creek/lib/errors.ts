export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  badRequest: (message: string, code = "BAD_REQUEST") => new AppError(message, 400, code),
  unauthorized: (message = "Sign in required", code = "UNAUTHORIZED") =>
    new AppError(message, 401, code),
  forbidden: (message = "Not permitted", code = "FORBIDDEN") =>
    new AppError(message, 403, code),
  notFound: (message = "Not found", code = "NOT_FOUND") => new AppError(message, 404, code),
  conflict: (message: string, code = "CONFLICT") => new AppError(message, 409, code),
  unprocessable: (message: string, code = "UNPROCESSABLE") =>
    new AppError(message, 422, code),
  internal: (message = "Something went wrong", code = "INTERNAL") =>
    new AppError(message, 500, code),
};

export function toApiError(e: unknown): { status: number; body: { error: string; code: string } } {
  if (e instanceof AppError) {
    return { status: e.status, body: { error: e.message, code: e.code } };
  }
  console.error(e);
  return { status: 500, body: { error: "Something went wrong", code: "INTERNAL" } };
}
