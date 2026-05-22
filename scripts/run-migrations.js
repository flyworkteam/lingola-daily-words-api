import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, getPool } from '../src/db/mysql.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(root, '..', 'database', 'migrations');

const SKIP_ERROR_CODES = new Set([
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_FIELDNAME',
  'ER_DUP_KEYNAME',
  'ER_CANT_CREATE_TABLE',
  'ER_FK_DUP_NAME',
  'ER_BAD_FIELD_ERROR',
  'ER_DUP_ENTRY',
]);

function splitSqlStatements(sql) {
  const withoutComments = sql.replace(/--[^\n]*/g, '');
  return withoutComments
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isSkippableSchemaError(error) {
  return error && typeof error === 'object' && SKIP_ERROR_CODES.has(error.code);
}

async function ensureMigrationTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name VARCHAR(191) NOT NULL PRIMARY KEY,
      appliedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function isApplied(name) {
  const rows = await query('SELECT name FROM _schema_migrations WHERE name = ? LIMIT 1', [
    name,
  ]);
  return rows.length > 0;
}

async function markApplied(name) {
  await query('INSERT INTO _schema_migrations (name) VALUES (?)', [name]);
}

async function runMigrationFolder(folder) {
  const sqlPath = path.join(migrationsDir, folder, 'migration.sql');
  if (!fs.existsSync(sqlPath)) {
    return;
  }

  const sql = fs.readFileSync(sqlPath, 'utf8').trim();
  if (!sql) {
    return;
  }

  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    try {
      await query(statement);
    } catch (error) {
      if (!isSkippableSchemaError(error)) {
        throw error;
      }
    }
  }

  await markApplied(folder);
  console.log(`Applied migration: ${folder}`);
}

async function main() {
  await ensureMigrationTable();

  const folders = fs
    .readdirSync(migrationsDir)
    .filter((entry) => fs.statSync(path.join(migrationsDir, entry)).isDirectory())
    .sort();

  for (const folder of folders) {
    if (await isApplied(folder)) {
      console.log(`Skip (already applied): ${folder}`);
      continue;
    }

    try {
      await runMigrationFolder(folder);
    } catch (error) {
      if (isSkippableSchemaError(error)) {
        await markApplied(folder);
        console.log(`Skip (schema already present): ${folder}`);
        continue;
      }

      console.error(`Migration failed: ${folder}`, error);
      process.exit(1);
    }
  }

  console.log('Migrations complete.');
}

main()
  .catch((error) => {
    console.error('Migration runner failed:', error);
    process.exit(1);
  })
  .finally(() => {
    getPool().end();
  });
