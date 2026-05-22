import type { RequestHandler } from 'express';
import type { FirebaseError } from 'firebase-admin';
import { ApiError } from '../http/api-error.js';
import { verifyFirebaseIdToken } from './firebase-admin.js';
import { prisma } from '../db/prisma.js';

function isFirebaseAuthError(error: unknown): error is FirebaseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as FirebaseError).code === 'string' &&
    (error as FirebaseError).code.startsWith('auth/')
  );
}

function toAuthApiError(error: unknown): ApiError {
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
  return new ApiError({
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'AUTHENTICATION_FAILED',
  });
}

async function authenticate(req: { header: (name: string) => string | undefined }) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'MISSING_BEARER_TOKEN' });
  }

  const token = auth.slice(7).trim();
  if (!token) {
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'INVALID_TOKEN' });
  }

  const decoded = await verifyFirebaseIdToken(token);
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user) {
    throw new ApiError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'USER_NOT_REGISTERED',
    });
  }

  return { decoded, user };
}

export function requireFirebaseUser(): RequestHandler {
  return async (req, _res, next) => {
    try {
      const { decoded, user } = await authenticate(req);
      req.firebaseToken = decoded;
      req.user = user;
      next();
    } catch (e) {
      next(toAuthApiError(e));
    }
  };
}

/** Vocabulary endpoints use { success, message } instead of { ok, error }. */
export function requireFirebaseUserVocabulary(): RequestHandler {
  return async (req, res, next) => {
    try {
      const { decoded, user } = await authenticate(req);
      req.firebaseToken = decoded;
      req.user = user;
      next();
    } catch (error) {
      const apiError = toAuthApiError(error);
      console.error('[vocabulary-auth]', error);
      return res.status(apiError.status).json({
        success: false,
        message: apiError.status === 401 ? 'Unauthorized' : apiError.message,
      });
    }
  };
}
