import { ApiError } from '../http/api-error.js';

export function isFirebaseAuthError(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('auth/')
  );
}

/** Maps Firebase / DB failures to API errors for auth routes. */
export function toAuthApiError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  if (isFirebaseAuthError(error)) {
    return new ApiError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'INVALID_TOKEN',
    });
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    (error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.code.startsWith('ER_'))
  ) {
    console.error('[auth] database error:', error);
    return new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'DATABASE_UNAVAILABLE',
    });
  }
  if (
    error instanceof Error &&
    error.message.includes('Firebase Admin is not configured')
  ) {
    console.error('[auth]', error.message);
    return new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'FIREBASE_ADMIN_NOT_CONFIGURED',
    });
  }
  console.error('[auth] unexpected error:', error);
  return new ApiError({
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'AUTHENTICATION_FAILED',
  });
}
