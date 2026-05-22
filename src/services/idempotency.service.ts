import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function getIdempotencyKey(req: { header: (name: string) => string | undefined }): string | null {
  const key = req.header('idempotency-key')?.trim();
  if (!key || key.length > 128) {
    return null;
  }
  return key;
}

export async function findStoredIdempotentResponse(
  userId: string,
  scope: string,
  idempotencyKey: string,
): Promise<{ statusCode: number; responseBody: Prisma.JsonValue } | null> {
  const now = new Date();
  const record = await prisma.requestIdempotency.findUnique({
    where: {
      userId_scope_idempotencyKey: {
        userId,
        scope,
        idempotencyKey,
      },
    },
    select: {
      statusCode: true,
      responseBody: true,
      expiresAt: true,
    },
  });

  if (!record || record.expiresAt < now) {
    return null;
  }

  return {
    statusCode: record.statusCode,
    responseBody: record.responseBody,
  };
}

export async function storeIdempotentResponse(
  userId: string,
  scope: string,
  idempotencyKey: string,
  statusCode: number,
  responseBody: Prisma.InputJsonValue,
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.requestIdempotency.upsert({
    where: {
      userId_scope_idempotencyKey: {
        userId,
        scope,
        idempotencyKey,
      },
    },
    create: {
      userId,
      scope,
      idempotencyKey,
      statusCode,
      responseBody,
      expiresAt,
    },
    update: {
      statusCode,
      responseBody,
      expiresAt,
    },
  });
}

export async function runIdempotent<T>(args: {
  userId: string;
  scope: string;
  idempotencyKey: string | null;
  execute: () => Promise<{ statusCode: number; body: T }>;
}): Promise<{ replayed: boolean; statusCode: number; body: T }> {
  const { userId, scope, idempotencyKey, execute } = args;

  if (idempotencyKey) {
    const cached = await findStoredIdempotentResponse(userId, scope, idempotencyKey);
    if (cached) {
      return {
        replayed: true,
        statusCode: cached.statusCode,
        body: cached.responseBody as T,
      };
    }
  }

  const result = await execute();

  if (idempotencyKey) {
    await storeIdempotentResponse(
      userId,
      scope,
      idempotencyKey,
      result.statusCode,
      result.body as Prisma.InputJsonValue,
    );
  }

  return { replayed: false, statusCode: result.statusCode, body: result.body };
}
