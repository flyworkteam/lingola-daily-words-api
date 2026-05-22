import type { VocabularyItem, Level } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { formatDateOnly, getTodayDateOnly } from './dailyActivity.service.js';
import {
  resolveUserLanguagePair,
  type VocabularyItemWithTranslations,
} from './vocabularyLanguage.service.js';
import {
  buildLevelWhere,
  findVocabularyForUserLanguage,
} from './vocabularyQuery.service.js';

const DEFAULT_LEVEL = 'A1';
const DEFAULT_DIFFICULTY = 1;
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const VALID_DIFFICULTIES = new Set([1, 2, 3]);

export type DailyWordPayload = {
  id: string;
  sourceText: string;
  targetText: string;
  pronunciationText: string | null;
  exampleSentence: string;
  exampleTranslation: string;
  level: string;
  date: string;
};

type VocabularyWithLevel = VocabularyItem & { level: Level };

type FetchedVocabularyItem = VocabularyItem & {
  level: Level;
  translations: { targetLang: string; targetText: string; exampleTranslation: string | null }[];
};

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickDeterministicItem(
  items: FetchedVocabularyItem[],
  userId: string,
  date: string,
) {
  const seed = `${userId}:${date}`;
  const index = hashString(seed) % items.length;
  return items[index]!;
}

function buildExampleSentence(sourceText: string, existing: string | null | undefined): string {
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

function buildExampleTranslation(
  targetText: string,
  existing: string | null | undefined,
): string {
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

function toDailyWordPayload(item: FetchedVocabularyItem, date: string): DailyWordPayload {
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

async function getUserCurrentLevel(userId: string): Promise<string> {
  const profile = await prisma.userLearningProfile.findUnique({
    where: { userId },
    select: { currentLevel: true },
  });

  const level = profile?.currentLevel ?? DEFAULT_LEVEL;
  return VALID_LEVELS.has(level) ? level : DEFAULT_LEVEL;
}

export async function resolveVocabularyLevel(
  userId: string,
  queryLevel?: unknown,
): Promise<string> {
  if (typeof queryLevel === 'string' && queryLevel.length > 0) {
    return VALID_LEVELS.has(queryLevel) ? queryLevel : DEFAULT_LEVEL;
  }
  return getUserCurrentLevel(userId);
}

async function getUserCurrentDifficulty(userId: string): Promise<number> {
  const profile = await prisma.userLearningProfile.findUnique({
    where: { userId },
    select: { currentDifficulty: true },
  });

  const difficulty = profile?.currentDifficulty ?? DEFAULT_DIFFICULTY;
  return VALID_DIFFICULTIES.has(difficulty) ? difficulty : DEFAULT_DIFFICULTY;
}

function parseDifficultyQuery(queryDifficulty: unknown): number | null {
  if (queryDifficulty === undefined) {
    return null;
  }

  const parsed = Number(queryDifficulty);
  if (!Number.isInteger(parsed) || !VALID_DIFFICULTIES.has(parsed)) {
    return null;
  }

  return parsed;
}

export async function resolvePracticeDifficulty(
  userId: string,
  queryDifficulty?: unknown,
): Promise<number> {
  const fromQuery = parseDifficultyQuery(queryDifficulty);
  if (fromQuery !== null) {
    return fromQuery;
  }

  return getUserCurrentDifficulty(userId);
}

async function fetchActiveVocabularyByLevel(
  levelCode: string,
  languages: { sourceLang: string; targetLang: string },
) {
  return findVocabularyForUserLanguage(languages, {
    where: buildLevelWhere(levelCode),
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
}

export async function getDailyWordForUser(userId: string): Promise<DailyWordPayload> {
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

  const selected = pickDeterministicItem(
    items as FetchedVocabularyItem[],
    userId,
    date,
  );
  return toDailyWordPayload(selected, date);
}
