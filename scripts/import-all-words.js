/**
 * Fetches all vocabulary (A1–C2) from verbs.fly-work.com and imports into the local DB.
 *
 * Usage:
 *   node scripts/import-all-words.js
 *   npm run import:all
 *
 * Env (.env / .env.local):
 *   DATABASE_URL
 *   VERB_API_BASE_URL  (default: https://verbs.fly-work.com/api)
 *   VERB_API_TOKEN
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import { generateId } from '../src/db/id.js';
import { getPool, query, withTransaction } from '../src/db/mysql.js';
import {
  createVocabularyItem,
  upsertVocabularyTranslationRow,
} from '../src/db/repositories.js';

dotenv.config();
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}

const LEVELS = [
  { code: 'A1', order: 1 },
  { code: 'A2', order: 2 },
  { code: 'B1', order: 3 },
  { code: 'B2', order: 4 },
  { code: 'C1', order: 5 },
  { code: 'C2', order: 6 },
];

const DAILY_LIFE_CATEGORY_ID = 'cmpv3t1udaXcu2lH5LSM';
const SOURCE_LANG = 'en';
const TARGET_LANG = 'tr';
const PAGE_LIMIT = 100;
const IMPORT_BATCH_SIZE = 50;

const API_BASE_URL = (
  process.env.VERB_API_BASE_URL?.trim() || 'https://verbs.fly-work.com/api'
).replace(/\/$/, '');
const API_TOKEN = process.env.VERB_API_TOKEN?.trim();

function emptyStats() {
  return { fetched: 0, inserted: 0, skipped: 0 };
}

function mapApiWord(item) {
  const sourceText = (item.source?.word || item.verb || '').trim();
  const targetText = (item.target?.translation || '').trim();
  const pronunciationText = item.target?.pronunciation?.trim() || null;

  return { sourceText, targetText, pronunciationText };
}

async function fetchWordsPage(level, offset) {
  const params = new URLSearchParams({
    targetLang: TARGET_LANG,
    verbLang: SOURCE_LANG,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  const url = `${API_BASE_URL}/words/level/${encodeURIComponent(level)}?${params}`;

  const response = await fetch(url, {
    headers: { 'x-api-token': API_TOKEN },
  });

  const rawBody = await response.text();
  let payload;

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(`Invalid JSON from Verb API (${url})`);
  }

  if (!response.ok) {
    throw new Error(
      `Verb API HTTP ${response.status} for ${level} offset=${offset}: ${rawBody.slice(0, 200)}`,
    );
  }

  if (!payload.success) {
    throw new Error(payload.message || `Verb API success=false for level ${level}`);
  }

  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchAllWordsForLevel(level) {
  const words = [];

  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const page = await fetchWordsPage(level, offset);
    if (page.length === 0) {
      break;
    }

    for (const item of page) {
      const mapped = mapApiWord(item);
      if (mapped.sourceText && mapped.targetText) {
        words.push(mapped);
      }
    }

    if (page.length < PAGE_LIMIT) {
      break;
    }
  }

  return words;
}

async function ensureCategory() {
  const rows = await query('SELECT id, name FROM Category WHERE id = ? LIMIT 1', [
    DAILY_LIFE_CATEGORY_ID,
  ]);
  if (!rows[0]) {
    throw new Error(
      `Category ${DAILY_LIFE_CATEGORY_ID} (Daily Life) not found. Run db:seed or restore backup first.`,
    );
  }
  return rows[0];
}

async function ensureLevel(code, order) {
  const ts = new Date();
  const existing = await query('SELECT * FROM Level WHERE code = ? LIMIT 1', [code]);

  if (existing[0]) {
    await query(
      'UPDATE Level SET name = ?, `order` = ?, isActive = 1, updatedAt = ? WHERE id = ?',
      [code, order, ts, existing[0].id],
    );
    return (await query('SELECT * FROM Level WHERE id = ? LIMIT 1', [existing[0].id]))[0];
  }

  const id = generateId();
  await query(
    `INSERT INTO Level (id, code, name, \`order\`, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [id, code, code, order, ts, ts],
  );
  return (await query('SELECT * FROM Level WHERE id = ? LIMIT 1', [id]))[0];
}

async function findExistingSourceTexts(levelId, sourceTexts) {
  if (sourceTexts.length === 0) {
    return new Set();
  }

  const placeholders = sourceTexts.map(() => '?').join(', ');
  const rows = await query(
    `SELECT sourceText FROM VocabularyItem
     WHERE levelId = ? AND sourceText IN (${placeholders})`,
    [levelId, ...sourceTexts],
  );

  return new Set(rows.map((row) => row.sourceText));
}

async function importWordsForLevel(levelRecord, categoryId, words) {
  const stats = emptyStats();
  stats.fetched = words.length;

  for (let offset = 0; offset < words.length; offset += IMPORT_BATCH_SIZE) {
    const chunk = words.slice(offset, offset + IMPORT_BATCH_SIZE);
    const existing = await findExistingSourceTexts(
      levelRecord.id,
      chunk.map((word) => word.sourceText),
    );

    const pending = chunk.filter((word) => {
      if (existing.has(word.sourceText)) {
        stats.skipped += 1;
        return false;
      }
      return true;
    });

    if (pending.length === 0) {
      continue;
    }

    await withTransaction(async (conn) => {
      for (const word of pending) {
        const item = await createVocabularyItem(
          {
            sourceText: word.sourceText,
            targetText: word.targetText,
            sourceLang: SOURCE_LANG,
            targetLang: TARGET_LANG,
            pronunciationText: word.pronunciationText,
            levelId: levelRecord.id,
            categoryId,
            type: 'word',
            difficultyScore: 1,
            order: 0,
            isActive: true,
          },
          conn,
        );

        await upsertVocabularyTranslationRow(
          item.id,
          TARGET_LANG,
          word.targetText,
          null,
          conn,
        );

        existing.add(word.sourceText);
      }
    });

    stats.inserted += pending.length;

    if (stats.inserted % 500 === 0 || offset + IMPORT_BATCH_SIZE >= words.length) {
      console.log(
        `  ${levelRecord.code} progress: inserted=${stats.inserted}, skipped=${stats.skipped}/${stats.fetched}`,
      );
    }
  }

  return stats;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!API_TOKEN) {
    throw new Error('VERB_API_TOKEN is not set');
  }

  const category = await ensureCategory();
  console.log(`Category: ${category.name} (${category.id})`);
  console.log(`API: ${API_BASE_URL}`);

  const levelResults = {};

  for (const { code, order } of LEVELS) {
    const levelRecord = await ensureLevel(code, order);
    console.log(`\nLevel ${code}: id=${levelRecord.id}`);

    console.log(`Fetching ${code}...`);
    const words = await fetchAllWordsForLevel(code);
    console.log(`  ${words.length} word(s) from API`);
    if (words.length === 0) {
      levelResults[code] = emptyStats();
      continue;
    }

    const stats = await importWordsForLevel(levelRecord, category.id, words);
    levelResults[code] = stats;
    console.log(
      `  Done ${code}: inserted=${stats.inserted}, skipped=${stats.skipped}, fetched=${stats.fetched}`,
    );
  }

  const totals = Object.values(levelResults).reduce((acc, stats) => {
    acc.fetched += stats.fetched;
    acc.inserted += stats.inserted;
    acc.skipped += stats.skipped;
    return acc;
  }, emptyStats());

  console.log('\nDone:', { levels: levelResults, totals });
}

main()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  })
  .finally(() => {
    getPool().end();
  });
