import {
  findIdempotencyRecord,
  upsertIdempotencyRecord,
} from '../db/repositories.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function getIdempotencyKey(req) {
  const key = req.header('idempotency-key')?.trim();
  if (!key || key.length > 128) {
    return null;
  }
  return key;
}

export async function findStoredIdempotentResponse(userId, scope, idempotencyKey) {
  return findIdempotencyRecord(userId, scope, idempotencyKey);
}

export async function storeIdempotentResponse(
  userId,
  scope,
  idempotencyKey,
  statusCode,
  responseBody,
  ttlMs = DEFAULT_TTL_MS,
) {
  const expiresAt = new Date(Date.now() + ttlMs);
  await upsertIdempotencyRecord(
    userId,
    scope,
    idempotencyKey,
    statusCode,
    responseBody,
    expiresAt,
  );
}

export async function runIdempotent({ userId, scope, idempotencyKey, execute }) {
  if (idempotencyKey) {
    const cached = await findStoredIdempotentResponse(userId, scope, idempotencyKey);
    if (cached) {
      return {
        replayed: true,
        statusCode: cached.statusCode,
        body: cached.responseBody,
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
      result.body,
    );
  }

  return { replayed: false, statusCode: result.statusCode, body: result.body };
}
