import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../http/api-error.js';

function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip ?? '';
}

function isIpAllowed(clientIp: string): boolean {
  const allowlist = env.ADMIN_IP_ALLOWLIST;
  if (allowlist.length === 0) {
    return true;
  }
  return allowlist.includes(clientIp);
}

function extractAdminApiKey(req: {
  header: (name: string) => string | undefined;
}): string | null {
  const dedicated = req.header('x-admin-api-key')?.trim();
  if (dedicated) {
    return dedicated;
  }

  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      return token;
    }
  }

  return null;
}

export function requireAdmin(): RequestHandler {
  return (req, _res, next) => {
    if (!env.ADMIN_API_KEY) {
      return next(
        new ApiError({
          status: 503,
          code: 'ADMIN_NOT_CONFIGURED',
          message: 'ADMIN_API_KEY is not configured',
        }),
      );
    }

    const clientIp = getClientIp(req);
    if (!isIpAllowed(clientIp)) {
      return next(
        new ApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'IP_NOT_ALLOWED',
        }),
      );
    }

    const providedKey = extractAdminApiKey(req);
    if (!providedKey || providedKey !== env.ADMIN_API_KEY) {
      return next(
        new ApiError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'INVALID_ADMIN_API_KEY',
        }),
      );
    }

    next();
  };
}
