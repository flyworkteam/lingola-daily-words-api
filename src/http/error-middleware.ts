import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { isApiError, zodToDetails } from './api-error.js';
import { fail } from './response.js';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return fail(res, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: zodToDetails(err),
    });
  }

  if (isApiError(err)) {
    return fail(res, {
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  console.error(err);
  return fail(res, {
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  });
};
