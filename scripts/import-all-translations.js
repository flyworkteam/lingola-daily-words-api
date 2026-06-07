/**
 * Mevcut VocabularyItem kayıtlarına harici API'den çok dilli çeviri ekler.
 * Kelime satırı oluşturmaz — önce npm run import:all çalıştırılmalı.
 *
 * Usage:
 *   node scripts/import-all-translations.js
 *   node scripts/import-all-translations.js de,fr,es
 *   npm run import:translations
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import { SUPPORTED_TARGET_LANGS } from '../src/constants/supportedLanguages.js';
import { getPool, query, withTransaction } from '../src/db/mysql.js';
import { upsertVocabularyTranslationRow } from '../src/db/repositories.js';

dotenv.config();
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}

const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const SOURCE_LANG = 'en';
const PAGE_LIMIT = 100;
const BATCH_SIZE = 50;

const API_BASE_URL = (
  process.env.VERB_API_BASE_URL?.trim() || 'https://verbs.fly-work.com/api'
).replace(/\/$/, '');
const API_TOKEN = process.env.VERB_API_TOKEN?.trim();

const targetLangs = process.argv[2]?.trim()
  ? process.argv[2].split(',').map((lang) => lang.trim().toLowerCase())
  : [...SUPPORTED_TARGET_LANGS];

function emptyStats() {
  return { fetched: 0, matched: 0, upserted: 0, unmatched: 0 };
}

function mapApiWord(item) {
  const sourceText = (item.source?.word || item.verb || '').trim();
  const targetText = (item.target?.translation || '').trim();
  return { sourceText, targetText };
}

async function fetchWordsPage(level, targetLang, offset) {
  const params = new URLSearchParams({
    targetLang,
    verbLang: SOURCE_LANG,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  const url = `${API_BASE_URL}/words/level/${encodeURIComponent(level)}?${params}`;
  const response = await fetch(url, { headers: { 'x-api-token': API_TOKEN } });
  const rawBody = await response.text();
  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(`Invalid JSON from Verb API (${url})`);
  }
  if (!response.ok) {
    throw new Error(`Verb API HTTP ${response.status} for ${level}/${targetLang}: ${rawBody.slice(0, 200)}`);
  }
  if (!payload.success) {
    throw new Error(payload.message || `Verb API success=false for ${level}/${targetLang}`);
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchAllWordsForLevel(level, targetLang) {
  const words = [];
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const page = await fetchWordsPage(level, targetLang, offset);
    if (page.length === 0) break;
    for (const item of page) {
      const mapped = mapApiWord(item);
      if (mapped.sourceText && mapped.targetText) {
        words.push(mapped);
      }
    }
    if (page.length < PAGE_LIMIT) break;
  }
  return words;
}

async function getLevelId(code) {
  const rows = await query('SELECT id FROM Level WHERE code = ? LIMIT 1', [code]);
  if (!rows[0]) throw new Error(`Level ${code} not found. Run db:seed first.`);
  return rows[0].id;
}

async function findItemIdsBySourceTexts(levelId, sourceTexts) {
  if (sourceTexts.length === 0) return new Map();
  const placeholders = sourceTexts.map(() => '?').join(', ');
  const rows = await query(
    `SELECT id, sourceText FROM VocabularyItem WHERE levelId = ? AND sourceText IN (${placeholders})`,
    [levelId, ...sourceTexts],
  );
  return new Map(rows.map((row) => [row.sourceText, row.id]));
}

async function upsertTranslationsForLevel(levelCode, levelId, targetLang, words) {
  const stats = emptyStats();
  stats.fetched = words.length;

  for (let offset = 0; offset < words.length; offset += BATCH_SIZE) {
    const chunk = words.slice(offset, offset + BATCH_SIZE);
    const idBySource = await findItemIdsBySourceTexts(
      levelId,
      chunk.map((word) => word.sourceText),
    );

    const pending = [];
    for (const word of chunk) {
      const itemId = idBySource.get(word.sourceText);
      if (!itemId) {
        stats.unmatched += 1;
        continue;
      }
      stats.matched += 1;
      pending.push({ itemId, targetText: word.targetText });
    }

    if (pending.length === 0) continue;

    await withTransaction(async (conn) => {
      for (const row of pending) {
        await upsertVocabularyTranslationRow(
          row.itemId,
          targetLang,
          row.targetText,
          null,
          conn,
        );
      }
    });

    stats.upserted += pending.length;

    if (stats.upserted % 1000 === 0 || offset + BATCH_SIZE >= words.length) {
      console.log(
        `  ${levelCode}/${targetLang}: upserted=${stats.upserted}, unmatched=${stats.unmatched}/${stats.fetched}`,
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

  console.log(`API: ${API_BASE_URL}`);
  console.log(`Languages: ${targetLangs.join(', ')}`);

  const results = {};
  const totals = emptyStats();

  for (const targetLang of targetLangs) {
    results[targetLang] = {};
    console.log(`\n=== ${targetLang.toUpperCase()} ===`);

    for (const levelCode of LEVELS) {
      const levelId = await getLevelId(levelCode);
      console.log(`Fetching ${levelCode}/${targetLang}...`);
      const words = await fetchAllWordsForLevel(levelCode, targetLang);
      console.log(`  ${words.length} from API`);

      if (words.length === 0) {
        results[targetLang][levelCode] = emptyStats();
        continue;
      }

      const stats = await upsertTranslationsForLevel(levelCode, levelId, targetLang, words);
      results[targetLang][levelCode] = stats;
      totals.fetched += stats.fetched;
      totals.matched += stats.matched;
      totals.upserted += stats.upserted;
      totals.unmatched += stats.unmatched;
      console.log(
        `  Done ${levelCode}/${targetLang}: upserted=${stats.upserted}, unmatched=${stats.unmatched}`,
      );
    }
  }

  console.log('\nDone:', { totals, results });
}

main()
  .catch((error) => {
    console.error('Translation import failed:', error);
    process.exit(1);
  })
  .finally(() => {
    getPool().end();
  });
