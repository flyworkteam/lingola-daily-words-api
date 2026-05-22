import type { Request, Response } from 'express';
import {
  resolvePracticeDifficulty,
  resolveVocabularyLevel,
} from '../services/dailyWord.service.js';
import { resolveUserLanguagePair } from '../services/vocabularyLanguage.service.js';
import {
  buildLevelAndDifficultyWhere,
  findVocabularyForUserLanguage,
} from '../services/vocabularyQuery.service.js';

function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, message });
}

function shuffle<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function parseOptionalLimit(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return null;
  }
  return limit;
}

function parseLimit(value: unknown, defaultValue: number): number | null {
  if (value === undefined) {
    return defaultValue;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return null;
  }
  return limit;
}

async function resolvePracticeLevel(req: Request): Promise<string> {
  return resolveVocabularyLevel(req.user!.id, req.query.level);
}

async function resolvePracticeLanguagesAndDifficulty(req: Request) {
  const [languages, difficulty] = await Promise.all([
    resolveUserLanguagePair(req.user!.id),
    resolvePracticeDifficulty(req.user!.id, req.query.difficulty),
  ]);

  return { languages, difficulty };
}

async function fetchPracticeVocabularyByLevelAndDifficulty(
  levelCode: string,
  difficulty: number,
  languages: Awaited<ReturnType<typeof resolveUserLanguagePair>>,
  limit?: number,
) {
  return findVocabularyForUserLanguage(languages, {
    where: buildLevelAndDifficultyWhere(levelCode, difficulty),
    orderBy: { order: 'asc' },
    ...(limit !== undefined ? { take: limit } : {}),
  });
}

function resolveSpeakingExampleSentence(
  sourceText: string,
  existing: string | null | undefined,
): string {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }

  const word = sourceText.trim();
  if (!word) {
    return 'I use the word in daily life.';
  }

  return `I use the word ${word} in daily life.`;
}

function resolveSpeakingExampleTranslation(
  targetText: string,
  existing: string | null | undefined,
): string {
  const trimmed = existing?.trim();
  if (trimmed) {
    return trimmed;
  }

  const word = targetText.trim();
  if (!word) {
    return 'Bu kelime günlük kullanımda öğrenilebilir.';
  }

  return `${word} kelimesi günlük kullanımda öğrenilebilir.`;
}

function toSpeakingPracticeItem(item: {
  id: string;
  sourceText: string;
  targetText: string;
  pronunciationText: string | null;
  exampleSentence: string | null;
  exampleTranslation: string | null;
}) {
  return {
    id: item.id,
    sourceText: item.sourceText,
    targetText: item.targetText,
    pronunciationText: item.pronunciationText,
    exampleSentence: resolveSpeakingExampleSentence(
      item.sourceText,
      item.exampleSentence,
    ),
    exampleTranslation: resolveSpeakingExampleTranslation(
      item.targetText,
      item.exampleTranslation,
    ),
  };
}

export async function getListening(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    const [levelCode, languages, difficulty] = await Promise.all([
      resolveVocabularyLevel(req.user.id, req.query.level),
      resolveUserLanguagePair(req.user.id),
      resolvePracticeDifficulty(req.user.id, req.query.difficulty),
    ]);

    const items = await fetchPracticeVocabularyByLevelAndDifficulty(
      levelCode,
      difficulty,
      languages,
    );

    if (items.length < 4) {
      return sendError(
        res,
        'Not enough vocabulary items for listening practice at this level and difficulty',
        400,
      );
    }

    const question = items[Math.floor(Math.random() * items.length)]!;
    const wrongOptions = shuffle(
      items.filter((item) => item.id !== question.id).map((item) => item.targetText),
    )
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 3);

    if (wrongOptions.length < 3) {
      return sendError(
        res,
        'Not enough unique translations for listening practice at this level and difficulty',
        400,
      );
    }

    const options = shuffle([question.targetText, ...wrongOptions]);

    return sendSuccess(res, {
      question: {
        id: question.id,
        sourceText: question.sourceText,
        audioUrl: question.audioUrl,
      },
      options,
      correctAnswer: question.targetText,
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to generate listening practice question');
  }
}

export async function getMultipleChoice(req: Request, res: Response) {
  try {
    const levelCode = await resolvePracticeLevel(req);

    const poolLimit = parseOptionalLimit(req.query.limit);
    if (poolLimit === null) {
      return sendError(res, 'limit must be a positive integer', 400);
    }

    const { languages, difficulty } = await resolvePracticeLanguagesAndDifficulty(req);
    const items = await fetchPracticeVocabularyByLevelAndDifficulty(
      levelCode,
      difficulty,
      languages,
      poolLimit,
    );

    if (items.length < 4) {
      return sendError(
        res,
        'Not enough vocabulary items for multiple choice in this level',
        400,
      );
    }

    const question = items[Math.floor(Math.random() * items.length)]!;
    const wrongOptions = shuffle(
      items.filter((item) => item.id !== question.id).map((item) => item.targetText),
    )
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 3);

    if (wrongOptions.length < 3) {
      return sendError(
        res,
        'Not enough unique translations for multiple choice in this level',
        400,
      );
    }

    const options = shuffle([question.targetText, ...wrongOptions]);

    return sendSuccess(res, {
      question: {
        id: question.id,
        sourceText: question.sourceText,
        pronunciationText: question.pronunciationText,
        exampleSentence: question.exampleSentence,
      },
      options,
      correctAnswer: question.targetText,
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to generate multiple choice question');
  }
}

export async function getMatching(req: Request, res: Response) {
  try {
    const levelCode = await resolvePracticeLevel(req);

    const limit = parseLimit(req.query.limit, 5);
    if (limit === null) {
      return sendError(res, 'limit must be a positive integer', 400);
    }

    const { languages, difficulty } = await resolvePracticeLanguagesAndDifficulty(req);
    const items = await fetchPracticeVocabularyByLevelAndDifficulty(
      levelCode,
      difficulty,
      languages,
    );

    if (items.length < limit) {
      return sendError(res, 'Not enough vocabulary items for matching in this level', 400);
    }

    const selected = shuffle(items)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        sourceText: item.sourceText,
        targetText: item.targetText,
      }));

    return sendSuccess(res, selected);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to generate matching practice');
  }
}

export async function getSpeaking(req: Request, res: Response) {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401);
    }

    const limit = parseLimit(req.query.limit, 10);
    if (limit === null) {
      return sendError(res, 'limit must be a positive integer', 400);
    }

    const [levelCode, languages, difficulty] = await Promise.all([
      resolveVocabularyLevel(req.user.id, req.query.level),
      resolveUserLanguagePair(req.user.id),
      resolvePracticeDifficulty(req.user.id, req.query.difficulty),
    ]);

    const items = await fetchPracticeVocabularyByLevelAndDifficulty(
      levelCode,
      difficulty,
      languages,
    );

    const selected = shuffle(items)
      .slice(0, limit)
      .map((item) => toSpeakingPracticeItem(item));

    return sendSuccess(res, selected);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch speaking practice words');
  }
}
