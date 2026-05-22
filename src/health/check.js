import { query } from '../db/mysql.js';

export async function checkDatabaseHealth() {
  const started = Date.now();
  try {
    await query('SELECT 1');
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
