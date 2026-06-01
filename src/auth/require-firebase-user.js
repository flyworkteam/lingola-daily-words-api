import { ApiError } from '../http/api-error.js';
import { findUserByFirebaseUid } from '../db/repositories.js';
import { verifyFirebaseIdToken } from './firebase-admin.js';
import { toAuthApiError } from './auth-errors.js';

async function authenticate(req) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'MISSING_BEARER_TOKEN' });
  }

  const token = auth.slice(7).trim();
  if (!token) {
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'INVALID_TOKEN' });
  }

  const decoded = await verifyFirebaseIdToken(token);
  const user = await findUserByFirebaseUid(decoded.uid);
  if (!user) {
    throw new ApiError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'USER_NOT_REGISTERED',
    });
  }

  return { decoded, user };
}

export function requireFirebaseUser() {
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
export function requireFirebaseUserVocabulary() {
  return async (req, res, next) => {
    try {
      const { decoded, user } = await authenticate(req);
      req.firebaseToken = decoded;
      req.user = user;
      next();
    } catch (error) {
      const apiError = toAuthApiError(error);
      console.error('[vocabulary-auth]', error);
      const message =
        apiError.message === 'USER_NOT_REGISTERED'
            ? 'USER_NOT_REGISTERED'
            : apiError.status === 401
              ? 'Unauthorized'
              : apiError.message;
      return res.status(apiError.status).json({
        success: false,
        message,
      });
    }
  };
}
