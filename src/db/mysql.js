import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

function parseDatabaseUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

const pool = mysql.createPool({
  ...parseDatabaseUrl(env.DATABASE_URL),
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: false,
});

export function getPool() {
  return pool;
}

export async function query(sql, params = [], connection = null) {
  const executor = connection ?? pool;
  const [results] = await executor.execute(sql, params);
  return results;
}

export async function withTransaction(fn) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function isDuplicateEntryError(error) {
  return error && typeof error === 'object' && error.code === 'ER_DUP_ENTRY';
}
