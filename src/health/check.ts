import { prisma } from '../db/prisma.js';

export type HealthCheckResult = {
  ok: boolean;
  database: 'up' | 'down';
  latencyMs?: number;
  error?: string;
};

export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true,
      database: 'up',
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database unreachable';
    return {
      ok: false,
      database: 'down',
      latencyMs: Date.now() - started,
      error: message,
    };
  }
}
