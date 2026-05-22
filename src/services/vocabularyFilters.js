export function buildLevelWhere(levelCode) {
  return { levelCode, sourceLang: 'en' };
}

export function buildLevelAndDifficultyWhere(levelCode, difficulty) {
  return { levelCode, difficultyScore: difficulty, sourceLang: 'en' };
}

export function normalizeVocabularyListWhere(where, levelCode) {
  const normalized = {
    sourceLang: 'en',
    levelCode: where.levelCode ?? levelCode ?? where.level?.code,
    categorySlug: where.categorySlug ?? where.category?.slug,
    difficultyScore: where.difficultyScore,
    translationLang: where.translationLang,
    letter: where.letter ?? where.sourceText?.startsWith,
    search: where.search,
  };

  if (where.AND) {
    for (const clause of where.AND) {
      if (clause.OR) {
        const first = clause.OR[0];
        if (first?.sourceText?.contains) {
          normalized.search = first.sourceText.contains;
        }
      }
    }
  }

  return normalized;
}
