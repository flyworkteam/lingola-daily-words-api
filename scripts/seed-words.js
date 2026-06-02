/**
 * Seeds vocabulary by posting words to POST /api/words/translate.
 *
 * Usage:
 *   node scripts/seed-words.js
 *
 * Env (.env / .env.local):
 *   API_BASE              (default: http://127.0.0.1:3000)
 *   ADMIN_API_KEY
 *   VERB_API_BASE_URL
 *   VERB_API_TOKEN
 */
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const TARGET_TOTAL = 797;
const SOURCE_LANG = 'en';
const TARGET_LANG = 'tr';
const PAGE_LIMIT = 100;

const API_BASE = (process.env.API_BASE?.trim() || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY?.trim();
const VERB_API_BASE = (
  process.env.VERB_API_BASE_URL?.trim() || 'https://verbs.fly-work.com/api'
).replace(/\/$/, '');
const VERB_API_TOKEN = process.env.VERB_API_TOKEN?.trim();

if (!ADMIN_API_KEY) {
  console.error('ADMIN_API_KEY is not set');
  process.exit(1);
}

if (!VERB_API_TOKEN) {
  console.error('VERB_API_TOKEN is not set');
  process.exit(1);
}

function mapApiWord(item) {
  return {
    sourceText: (item.source?.word || item.verb || '').trim(),
    targetText: (item.target?.translation || '').trim(),
    pronunciationText: item.target?.pronunciation?.trim() || null,
    level: item.level,
  };
}

async function fetchWordsPage(level, offset) {
  const params = new URLSearchParams({
    targetLang: TARGET_LANG,
    verbLang: SOURCE_LANG,
    limit: String(PAGE_LIMIT),
    offset: String(offset),
  });
  const url = `${VERB_API_BASE}/words/level/${encodeURIComponent(level)}?${params}`;
  const response = await fetch(url, {
    headers: { 'x-api-token': VERB_API_TOKEN },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(`Verb API failed for ${level} offset=${offset}: ${response.status}`);
  }
  return (Array.isArray(payload.data) ? payload.data : []).map(mapApiWord);
}

async function collectFromLevel(level, seen, words, maxForLevel) {
  let levelCount = 0;
  for (let offset = 0; levelCount < maxForLevel && words.length < TARGET_TOTAL; offset += PAGE_LIMIT) {
    const page = await fetchWordsPage(level, offset);
    if (page.length === 0) {
      break;
    }

    for (const word of page) {
      if (!word.sourceText || !word.targetText) {
        continue;
      }
      const key = word.sourceText.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      words.push({ ...word, level });
      levelCount += 1;
      if (words.length >= TARGET_TOTAL || levelCount >= maxForLevel) {
        break;
      }
    }
  }
  return levelCount;
}

async function collectWords() {
  const perLevel = Math.ceil(TARGET_TOTAL / LEVELS.length);
  const seen = new Set();
  const words = [];

  for (const level of LEVELS) {
    const levelCount = await collectFromLevel(level, seen, words, perLevel);
    console.log(`Collected ${level}: ${levelCount} (total ${words.length})`);
  }

  if (words.length < TARGET_TOTAL) {
    console.log(`Backfilling ${TARGET_TOTAL - words.length} words from levels with data...`);
    for (const level of ['B2', 'B1', 'A2', 'A1']) {
      if (words.length >= TARGET_TOTAL) {
        break;
      }
      const need = TARGET_TOTAL - words.length;
      const added = await collectFromLevel(level, seen, words, need);
      if (added > 0) {
        console.log(`Backfill ${level}: +${added} (total ${words.length})`);
      }
    }
  }

  return words.slice(0, TARGET_TOTAL);
}

async function postWord(word) {
  const response = await fetch(`${API_BASE}/api/words/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      word: word.sourceText,
      targetText: word.targetText,
      pronunciationText: word.pronunciationText,
      level: word.level,
      targetLang: TARGET_LANG,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `translate failed for "${word.sourceText}" (${response.status}): ${payload.message ?? 'unknown'}`,
    );
  }
  return payload;
}

async function main() {
  console.log(`API_BASE=${API_BASE}`);
  console.log(`Fetching up to ${TARGET_TOTAL} words from ${VERB_API_BASE}...`);

  const words = await collectWords();
  console.log(`Posting ${words.length} words to ${API_BASE}/api/words/translate ...`);

  const totals = { inserted: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    try {
      const result = await postWord(word);
      totals.inserted += result.inserted ?? 0;
      totals.skipped += result.skipped ?? 0;
      if ((i + 1) % 50 === 0 || i === words.length - 1) {
        console.log(`Progress ${i + 1}/${words.length}`);
      }
    } catch (error) {
      totals.failed += 1;
      console.error(error.message);
    }
  }

  console.log('Done:', { words: words.length, ...totals });
}

main().catch((error) => {
  console.error('seed-words failed:', error);
  process.exit(1);
});
