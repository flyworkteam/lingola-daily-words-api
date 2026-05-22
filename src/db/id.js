import { randomBytes } from 'node:crypto';

/** Prisma-compatible cuid-like id (25 chars). */
export function generateId() {
  const time = Date.now().toString(36);
  const random = randomBytes(8).toString('base64url').replace(/[_-]/g, 'a').slice(0, 16);
  return `c${time}${random}`.slice(0, 25);
}
