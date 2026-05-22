import { findUserLearningProfile } from '../db/repositories.js';
import { formatDateOnly, getTodayDateOnly } from './dailyActivity.service.js';
import { resolveUserLanguagePair } from './vocabularyLanguage.service.js';
import { findVocabularyItems } from '../db/repositories.js';
import {
  applyVocabularyLanguageFilter,
  mapVocabularyItemForTargetLang,
  translationLangsForQuery,
} from './vocabularyLanguage.service.js';
import { buildLevelWhere } from './vocabularyFilters.js';

const DEFAULT_LEVEL = 'A1';
const DEFAULT_DIFFICULTY = 1;
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const VALID_DIFFICULTIES = new Set([1, 2, 3]);

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickDeterministicItem(items, userId, date) {
  const seed = `${userId}:${date}`;
  const index = hashString(seed) % items.length;
  return items[index];
}

function buildExampleSentence(sourceText, existing) {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }

  const word = sourceText.trim();
  if (!word) {
    return 'This is a short example sentence.';
  }

  return `I often use the word "${word}" in daily life.`;
}

function buildExampleTranslation(targetText, existing) {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }

  const word = targetText.trim();
  if (!word) {
    return 'Bu kelime için kısa bir örnek açıklama.';
  }

  return `"${word}" kelimesini günlük konuşmada sık kullanırım.`;
}

function toDailyWordPayload(item, date) {
  return {
    id: item.id,
    sourceText: item.sourceText,
    targetText: item.targetText,
    pronunciationText: item.pronunciationText,
    exampleSentence: buildExampleSentence(item.sourceText, item.exampleSentence),
    exampleTranslation: buildExampleTranslation(
      item.targetText,
      item.exampleTranslation,
    ),
    level: item.level.code,
    date,
  };
}

async function getUserCurrentLevel(userId) {
  const profile = await findUserLearningProfile(userId);
  const level = profile?.currentLevel ?? DEFAULT_LEVEL;
  return VALID_LEVELS.has(level) ? level : DEFAULT_LEVEL;
}

export async function resolveVocabularyLevel(userId, queryLevel) {
  if (typeof queryLevel === 'string' && queryLevel.length > 0) {
    return VALID_LEVELS.has(queryLevel) ? queryLevel : DEFAULT_LEVEL;
  }
  return getUserCurrentLevel(userId);
}

async function getUserCurrentDifficulty(userId) {
  const profile = await findUserLearningProfile(userId);
  const difficulty = profile?.currentDifficulty ?? DEFAULT_DIFFICULTY;
  return VALID_DIFFICULTIES.has(difficulty) ? difficulty : DEFAULT_DIFFICULTY;
}

function parseDifficultyQuery(queryDifficulty) {
  if (queryDifficulty === undefined) {
    return null;
  }

  const parsed = Number(queryDifficulty);
  if (!Number.isInteger(parsed) || !VALID_DIFFICULTIES.has(parsed)) {
    return null;
  }

  return parsed;
}

export async function resolvePracticeDifficulty(userId, queryDifficulty) {
  const fromQuery = parseDifficultyQuery(queryDifficulty);
  if (fromQuery !== null) {
    return fromQuery;
  }

  return getUserCurrentDifficulty(userId);
}

async function fetchActiveVocabularyByLevel(levelCode, languages) {
  const preferred = languages.targetLang;
  const filters = applyVocabularyLanguageFilter(buildLevelWhere(levelCode), languages, {
    translationTargetLang: preferred,
  });

  let items = await findVocabularyItems({
    ...filters,
    translationLangs: translationLangsForQuery(preferred),
    orderBy: 'order',
  });

  if (items.length === 0 && preferred !== 'tr') {
    const fallbackFilters = applyVocabularyLanguageFilter(buildLevelWhere(levelCode), languages, {
      translationTargetLang: 'tr',
    });
    items = await findVocabularyItems({
      ...fallbackFilters,
      translationLangs: translationLangsForQuery('tr'),
      orderBy: 'order',
    });
  }

  return items.map((item) => mapVocabularyItemForTargetLang(item, languages.targetLang));
}

export async function getDailyWordForUser(userId) {
  const date = formatDateOnly(getTodayDateOnly());
  const currentLevel = await getUserCurrentLevel(userId);
  const languages = await resolveUserLanguagePair(userId);

  let items = await fetchActiveVocabularyByLevel(currentLevel, languages);

  if (items.length === 0 && currentLevel !== DEFAULT_LEVEL) {
    items = await fetchActiveVocabularyByLevel(DEFAULT_LEVEL, languages);
  }

  if (items.length === 0) {
    throw new Error('NO_VOCABULARY_FOR_DAILY_WORD');
  }

  const selected = pickDeterministicItem(items, userId, date);
  return toDailyWordPayload(selected, date);
}
