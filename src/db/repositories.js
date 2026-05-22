import { generateId } from './id.js';
import { isDuplicateEntryError, query, withTransaction } from './mysql.js';

const now = () => new Date();

// --- User ---

export async function findUserByFirebaseUid(firebaseUid) {
  const rows = await query('SELECT * FROM `User` WHERE firebaseUid = ? LIMIT 1', [firebaseUid]);
  return rows[0] ?? null;
}

export async function upsertUserFromFirebase({
  firebaseUid,
  email,
  displayName,
  photoUrl,
  provider,
  lastLoginAt,
}) {
  const existing = await findUserByFirebaseUid(firebaseUid);
  if (existing) {
    await query(
      `UPDATE \`User\` SET email = ?, displayName = ?, photoUrl = ?, provider = ?, lastLoginAt = ?, updatedAt = ? WHERE id = ?`,
      [email, displayName, photoUrl, provider, lastLoginAt, now(), existing.id],
    );
    return { ...existing, email, displayName, photoUrl, provider, lastLoginAt };
  }

  const id = generateId();
  const createdAt = now();
  await query(
    `INSERT INTO \`User\` (id, firebaseUid, email, displayName, photoUrl, provider, createdAt, updatedAt, lastLoginAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, firebaseUid, email, displayName, photoUrl, provider, createdAt, createdAt, lastLoginAt],
  );
  return {
    id,
    firebaseUid,
    email,
    displayName,
    photoUrl,
    provider,
    createdAt,
    updatedAt: createdAt,
    lastLoginAt,
  };
}

// --- User learning profile ---

export async function findUserLearningProfile(userId) {
  const rows = await query('SELECT * FROM UserLearningProfile WHERE userId = ? LIMIT 1', [userId]);
  return rows[0] ?? null;
}

export async function createUserLearningProfile(data) {
  const id = generateId();
  const ts = now();
  await query(
    `INSERT INTO UserLearningProfile (id, userId, currentLevel, currentDifficulty, targetLang, sourceLang, dailyGoal, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.userId,
      data.currentLevel ?? 'A1',
      data.currentDifficulty ?? 1,
      data.targetLang ?? 'tr',
      data.sourceLang ?? 'en',
      data.dailyGoal ?? 10,
      ts,
      ts,
    ],
  );
  return findUserLearningProfile(data.userId);
}

export async function upsertUserLearningProfile(data) {
  const existing = await findUserLearningProfile(data.userId);
  if (existing) {
    await query(
      `UPDATE UserLearningProfile SET currentLevel = ?, currentDifficulty = ?, targetLang = ?, sourceLang = ?, dailyGoal = ?, updatedAt = ? WHERE userId = ?`,
      [
        data.currentLevel ?? existing.currentLevel,
        data.currentDifficulty ?? existing.currentDifficulty,
        data.targetLang ?? existing.targetLang,
        data.sourceLang ?? existing.sourceLang,
        data.dailyGoal ?? existing.dailyGoal,
        now(),
        data.userId,
      ],
    );
    return findUserLearningProfile(data.userId);
  }
  return createUserLearningProfile(data);
}

// --- User stats ---

export async function findUserStats(userId) {
  const rows = await query('SELECT * FROM UserStats WHERE userId = ? LIMIT 1', [userId]);
  return rows[0] ?? null;
}

export async function ensureUserStats(userId, connection = null) {
  const existing = await query('SELECT * FROM UserStats WHERE userId = ? LIMIT 1', [userId], connection);
  if (existing[0]) return existing[0];

  const id = generateId();
  const ts = now();
  await query(
    `INSERT INTO UserStats (id, userId, coins, gems, xp, totalXp, createdAt, updatedAt) VALUES (?, ?, 0, 0, 0, 0, ?, ?)`,
    [id, userId, ts, ts],
    connection,
  );
  const rows = await query('SELECT * FROM UserStats WHERE userId = ? LIMIT 1', [userId], connection);
  return rows[0];
}

export async function incrementUserStatsGems(userId, delta, connection = null) {
  await ensureUserStats(userId, connection);
  await query('UPDATE UserStats SET gems = gems + ?, updatedAt = ? WHERE userId = ?', [
    delta,
    now(),
    userId,
  ], connection);
  const rows = await query('SELECT * FROM UserStats WHERE userId = ? LIMIT 1', [userId], connection);
  return rows[0];
}

// --- Daily activity ---

export async function upsertDailyActivityIncrement({
  userId,
  date,
  seenDelta,
  correctDelta,
  wrongDelta,
  completedDelta,
  studySecondsDelta,
}) {
  const existing = await query(
    'SELECT * FROM UserDailyActivity WHERE userId = ? AND date = ? LIMIT 1',
    [userId, date],
  );

  if (!existing[0]) {
    const id = generateId();
    const ts = now();
    await query(
      `INSERT INTO UserDailyActivity (id, userId, date, seenCount, correctCount, wrongCount, completedCount, studySeconds, isGoalCompleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, false, ?, ?)`,
      [
        id,
        userId,
        date,
        seenDelta,
        correctDelta,
        wrongDelta,
        completedDelta,
        studySecondsDelta,
        ts,
        ts,
      ],
    );
    const rows = await query(
      'SELECT * FROM UserDailyActivity WHERE userId = ? AND date = ? LIMIT 1',
      [userId, date],
    );
    return rows[0];
  }

  const row = existing[0];
  await query(
    `UPDATE UserDailyActivity SET
      seenCount = seenCount + ?,
      correctCount = correctCount + ?,
      wrongCount = wrongCount + ?,
      completedCount = completedCount + ?,
      studySeconds = studySeconds + ?,
      updatedAt = ?
     WHERE id = ?`,
    [seenDelta, correctDelta, wrongDelta, completedDelta, studySecondsDelta, now(), row.id],
  );
  const rows = await query('SELECT * FROM UserDailyActivity WHERE id = ? LIMIT 1', [row.id]);
  return rows[0];
}

export async function findDailyActivitiesSince(userId, sinceDate) {
  return query(
    'SELECT * FROM UserDailyActivity WHERE userId = ? AND date >= ? ORDER BY date DESC',
    [userId, sinceDate],
  );
}

// --- Daily reward progress ---

export async function findDailyRewardProgress(userId, date) {
  const rows = await query(
    'SELECT * FROM UserDailyRewardProgress WHERE userId = ? AND date = ? LIMIT 1',
    [userId, date],
  );
  return rows[0] ?? null;
}

export async function ensureDailyRewardProgress(userId, date) {
  const existing = await findDailyRewardProgress(userId, date);
  if (existing) return existing;

  const id = generateId();
  const ts = now();
  await query(
    `INSERT INTO UserDailyRewardProgress (id, userId, date, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
    [id, userId, date, ts, ts],
  );
  return findDailyRewardProgress(userId, date);
}

const REWARD_INCREMENT_COLUMNS = {
  learned_word: 'learnedWordCount',
  speaking_practice: 'speakingPracticeCount',
  test_answer: 'testAnswerCount',
  review_word: 'reviewWordCount',
  review_correct: 'reviewCorrectCount',
};

export async function incrementDailyRewardProgressRow(userId, date, type, amount) {
  const column = REWARD_INCREMENT_COLUMNS[type];
  if (!column) throw new Error('Invalid daily reward increment type');

  await ensureDailyRewardProgress(userId, date);
  await query(
    `UPDATE UserDailyRewardProgress SET ${column} = ${column} + ?, updatedAt = ? WHERE userId = ? AND date = ?`,
    [amount, now(), userId, date],
  );
  return findDailyRewardProgress(userId, date);
}

export async function applyDailyRewardClaims(userId, progress, computation) {
  return withTransaction(async (conn) => {
    const result = await query(
      `UPDATE UserDailyRewardProgress SET
        learnedRewardClaimCount = ?,
        speakingRewardClaimCount = ?,
        testRewardClaimCount = ?,
        reviewRewardClaimCount = ?,
        earnedGems = earnedGems + ?,
        updatedAt = ?
       WHERE id = ? AND learnedRewardClaimCount = ? AND speakingRewardClaimCount = ? AND testRewardClaimCount = ? AND reviewRewardClaimCount = ?`,
      [
        computation.learnedResult.newClaimCount,
        computation.speakingResult.newClaimCount,
        computation.testResult.newClaimCount,
        computation.reviewResult.newClaimCount,
        computation.awardedGems,
        now(),
        progress.id,
        progress.learnedRewardClaimCount,
        progress.speakingRewardClaimCount,
        progress.testRewardClaimCount,
        progress.reviewRewardClaimCount,
      ],
      conn,
    );

    if (!result.affectedRows) {
      return false;
    }

    await incrementUserStatsGems(userId, computation.awardedGems, conn);
    return true;
  });
}

// --- Streak share reward ---

export async function findDailyShareReward(userId, date) {
  const rows = await query(
    'SELECT * FROM UserDailyShareReward WHERE userId = ? AND date = ? LIMIT 1',
    [userId, date],
  );
  return rows[0] ?? null;
}

export async function claimStreakShareRewardTx(userId, date, rewardGems) {
  return withTransaction(async (conn) => {
    const id = generateId();
    const ts = now();
    await query(
      `INSERT INTO UserDailyShareReward (id, userId, date, rewardGems, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, date, rewardGems, ts, ts],
      conn,
    );
    return incrementUserStatsGems(userId, rewardGems, conn);
  });
}

export { isDuplicateEntryError };

// --- Idempotency ---

export async function findIdempotencyRecord(userId, scope, idempotencyKey) {
  const rows = await query(
    `SELECT statusCode, responseBody, expiresAt FROM RequestIdempotency
     WHERE userId = ? AND scope = ? AND idempotencyKey = ? LIMIT 1`,
    [userId, scope, idempotencyKey],
  );
  const record = rows[0];
  if (!record) return null;
  if (record.expiresAt < new Date()) return null;
  return {
    statusCode: record.statusCode,
    responseBody:
      typeof record.responseBody === 'string'
        ? JSON.parse(record.responseBody)
        : record.responseBody,
  };
}

export async function upsertIdempotencyRecord(
  userId,
  scope,
  idempotencyKey,
  statusCode,
  responseBody,
  expiresAt,
) {
  const existing = await query(
    `SELECT id FROM RequestIdempotency WHERE userId = ? AND scope = ? AND idempotencyKey = ? LIMIT 1`,
    [userId, scope, idempotencyKey],
  );
  const json = JSON.stringify(responseBody);

  if (existing[0]) {
    await query(
      `UPDATE RequestIdempotency SET statusCode = ?, responseBody = ?, expiresAt = ? WHERE id = ?`,
      [statusCode, json, expiresAt, existing[0].id],
    );
    return;
  }

  const id = generateId();
  await query(
    `INSERT INTO RequestIdempotency (id, userId, scope, idempotencyKey, statusCode, responseBody, createdAt, expiresAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, scope, idempotencyKey, statusCode, json, now(), expiresAt],
  );
}

// --- Adaptive level ---

export async function aggregateVocabularyProgress(userId) {
  const rows = await query(
    `SELECT
      COALESCE(SUM(answerCount), 0) AS answerCount,
      COALESCE(SUM(correctCount), 0) AS correctCount,
      COALESCE(SUM(wrongCount), 0) AS wrongCount,
      COALESCE(SUM(totalAnswerTimeMs), 0) AS totalAnswerTimeMs
     FROM UserVocabularyProgress WHERE userId = ?`,
    [userId],
  );
  return rows[0] ?? { answerCount: 0, correctCount: 0, wrongCount: 0, totalAnswerTimeMs: 0 };
}

// --- Catalog (languages, levels, categories, lessons) ---

export async function findActiveLanguages() {
  return query('SELECT * FROM Language WHERE isActive = 1 ORDER BY name ASC');
}

export async function findActiveLevels() {
  return query('SELECT * FROM Level WHERE isActive = 1 ORDER BY `order` ASC');
}

export async function findActiveCategories() {
  return query('SELECT * FROM Category WHERE isActive = 1 ORDER BY name ASC');
}

export async function findLessons(filters = {}) {
  const clauses = ['l.isActive = 1'];
  const params = [];

  if (filters.languageCode) {
    clauses.push('lang.code = ? AND lang.isActive = 1');
    params.push(filters.languageCode);
  }
  if (filters.levelCode) {
    clauses.push('lvl.code = ? AND lvl.isActive = 1');
    params.push(filters.levelCode);
  }
  if (filters.categorySlug) {
    clauses.push('cat.slug = ? AND cat.isActive = 1');
    params.push(filters.categorySlug);
  }

  const sql = `
    SELECT l.*,
      JSON_OBJECT('id', lang.id, 'code', lang.code, 'name', lang.name, 'isActive', lang.isActive) AS language,
      JSON_OBJECT('id', lvl.id, 'code', lvl.code, 'name', lvl.name, 'order', lvl.\`order\`, 'isActive', lvl.isActive) AS level,
      JSON_OBJECT('id', cat.id, 'name', cat.name, 'slug', cat.slug, 'isActive', cat.isActive) AS category
    FROM Lesson l
    JOIN Language lang ON l.languageId = lang.id
    JOIN Level lvl ON l.levelId = lvl.id
    JOIN Category cat ON l.categoryId = cat.id
    WHERE ${clauses.join(' AND ')}
    ORDER BY l.\`order\` ASC`;

  const rows = await query(sql, params);
  return rows.map(parseLessonRow);
}

function parseLessonRow(row) {
  return {
    ...pickLessonFields(row),
    language: parseJsonField(row.language),
    level: parseJsonField(row.level),
    category: parseJsonField(row.category),
  };
}

function pickLessonFields(row) {
  const { language, level, category, ...lesson } = row;
  return lesson;
}

function parseJsonField(value) {
  if (!value) return value;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export async function findLessonById(id, withItems = false) {
  const rows = await query(
    `SELECT l.*,
      JSON_OBJECT('id', lang.id, 'code', lang.code, 'name', lang.name, 'isActive', lang.isActive) AS language,
      JSON_OBJECT('id', lvl.id, 'code', lvl.code, 'name', lvl.name, 'order', lvl.\`order\`, 'isActive', lvl.isActive) AS level,
      JSON_OBJECT('id', cat.id, 'name', cat.name, 'slug', cat.slug, 'isActive', cat.isActive) AS category
     FROM Lesson l
     JOIN Language lang ON l.languageId = lang.id
     JOIN Level lvl ON l.levelId = lvl.id
     JOIN Category cat ON l.categoryId = cat.id
     WHERE l.id = ? AND l.isActive = 1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;

  const lesson = parseLessonRow(rows[0]);
  if (!withItems) return lesson;

  const items = await query(
    'SELECT * FROM LessonItem WHERE lessonId = ? ORDER BY `order` ASC',
    [id],
  );
  return { ...lesson, items };
}

export async function findLessonItems(lessonId) {
  const lesson = await query('SELECT id FROM Lesson WHERE id = ? AND isActive = 1 LIMIT 1', [lessonId]);
  if (!lesson[0]) return null;
  return query('SELECT * FROM LessonItem WHERE lessonId = ? ORDER BY `order` ASC', [lessonId]);
}

// --- Vocabulary ---

async function loadTranslationsForItems(itemIds, targetLangs) {
  if (itemIds.length === 0) return new Map();

  const placeholders = itemIds.map(() => '?').join(',');
  const langPlaceholders = targetLangs.map(() => '?').join(',');
  const rows = await query(
    `SELECT * FROM VocabularyTranslation WHERE vocabularyItemId IN (${placeholders}) AND targetLang IN (${langPlaceholders})`,
    [...itemIds, ...targetLangs],
  );

  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.vocabularyItemId) ?? [];
    list.push({
      targetLang: row.targetLang,
      targetText: row.targetText,
      exampleTranslation: row.exampleTranslation,
    });
    map.set(row.vocabularyItemId, list);
  }
  return map;
}

async function attachVocabularyRelations(items, translationLangs) {
  if (items.length === 0) return [];

  const levelIds = [...new Set(items.map((i) => i.levelId))];
  const categoryIds = [...new Set(items.map((i) => i.categoryId).filter(Boolean))];

  const levels = await query(
    `SELECT * FROM Level WHERE id IN (${levelIds.map(() => '?').join(',')})`,
    levelIds,
  );
  const levelById = new Map(levels.map((l) => [l.id, l]));

  let categoryById = new Map();
  if (categoryIds.length > 0) {
    const categories = await query(
      `SELECT * FROM Category WHERE id IN (${categoryIds.map(() => '?').join(',')})`,
      categoryIds,
    );
    categoryById = new Map(categories.map((c) => [c.id, c]));
  }

  const translationsByItem = await loadTranslationsForItems(
    items.map((i) => i.id),
    translationLangs,
  );

  return items.map((item) => ({
    ...item,
    level: levelById.get(item.levelId) ?? null,
    category: item.categoryId ? categoryById.get(item.categoryId) ?? null : null,
    translations: translationsByItem.get(item.id) ?? [],
  }));
}

function buildVocabularyWhere(filters, params) {
  const clauses = ['vi.isActive = 1', 'vi.sourceLang = ?', 'l.isActive = 1'];
  params.push(filters.sourceLang ?? 'en');

  if (filters.levelCode) {
    clauses.push('l.code = ?');
    params.push(filters.levelCode);
  }

  if (filters.categorySlug) {
    clauses.push(
      'EXISTS (SELECT 1 FROM Category c WHERE c.id = vi.categoryId AND c.slug = ? AND c.isActive = 1)',
    );
    params.push(filters.categorySlug);
  }

  if (filters.difficultyScore !== undefined) {
    clauses.push('vi.difficultyScore = ?');
    params.push(filters.difficultyScore);
  }

  if (filters.translationLang) {
    clauses.push(
      `EXISTS (SELECT 1 FROM VocabularyTranslation vt WHERE vt.vocabularyItemId = vi.id AND vt.targetLang = ?)`,
    );
    params.push(filters.translationLang);
  }

  if (filters.letter) {
    clauses.push('vi.sourceText LIKE ?');
    params.push(`${filters.letter}%`);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    clauses.push(`(
      vi.sourceText LIKE ? OR vi.targetText LIKE ? OR vi.pronunciationText LIKE ?
      OR EXISTS (
        SELECT 1 FROM VocabularyTranslation vt
        WHERE vt.vocabularyItemId = vi.id AND vt.targetText LIKE ?
      )
    )`);
    params.push(term, term, term, term);
  }

  return clauses.join(' AND ');
}

export async function findVocabularyItems({
  levelCode,
  difficultyScore,
  sourceLang = 'en',
  translationLang,
  translationLangs,
  orderBy = 'order',
  take,
  skip,
}) {
  const params = [];
  const where = buildVocabularyWhere(
    { levelCode, difficultyScore, sourceLang, translationLang },
    params,
  );

  let sql = `
    SELECT vi.* FROM VocabularyItem vi
    JOIN Level l ON vi.levelId = l.id
    WHERE ${where}`;

  if (orderBy === 'order') {
    sql += ' ORDER BY vi.`order` ASC, vi.id ASC';
  } else if (orderBy === 'sourceText') {
    sql += ' ORDER BY vi.sourceText ASC';
  } else if (orderBy === 'createdAt') {
    sql += ' ORDER BY vi.createdAt ASC, vi.id ASC';
  }

  if (take !== undefined) {
    sql += ' LIMIT ?';
    params.push(take);
    if (skip !== undefined) {
      sql += ' OFFSET ?';
      params.push(skip);
    }
  }

  const items = await query(sql, params);
  const langs = translationLangs ?? (translationLang ? [translationLang] : ['tr']);
  return attachVocabularyRelations(items, langs);
}

export async function countVocabularyItems(filters) {
  const params = [];
  const where = buildVocabularyWhere(filters, params);
  const rows = await query(
    `SELECT COUNT(*) AS cnt FROM VocabularyItem vi
     JOIN Level l ON vi.levelId = l.id
     WHERE ${where}`,
    params,
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function findVocabularyItemById(id, translationLangs) {
  const rows = await query(
    'SELECT * FROM VocabularyItem WHERE id = ? AND isActive = 1 LIMIT 1',
    [id],
  );
  if (!rows[0]) return null;
  const [item] = await attachVocabularyRelations([rows[0]], translationLangs);
  return item;
}

export async function findActiveVocabularyItemById(id) {
  const rows = await query(
    'SELECT id FROM VocabularyItem WHERE id = ? AND isActive = 1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function findVocabularyBySourceTexts(levelId, sourceTexts, targetLang) {
  if (sourceTexts.length === 0) return [];

  const placeholders = sourceTexts.map(() => '?').join(',');
  const items = await query(
    `SELECT vi.id, vi.sourceText FROM VocabularyItem vi
     WHERE vi.sourceLang = 'en' AND vi.levelId = ? AND vi.sourceText IN (${placeholders})`,
    [levelId, ...sourceTexts],
  );

  const ids = items.map((i) => i.id);
  if (ids.length === 0) return [];

  const trans = await query(
    `SELECT vocabularyItemId, targetText FROM VocabularyTranslation
     WHERE vocabularyItemId IN (${ids.map(() => '?').join(',')}) AND targetLang = ?`,
    [...ids, targetLang],
  );
  const transByItem = new Map(trans.map((t) => [t.vocabularyItemId, t.targetText]));

  return items.map((item) => ({
    id: item.id,
    sourceText: item.sourceText,
    translations: transByItem.has(item.id)
      ? [{ targetText: transByItem.get(item.id) }]
      : [],
  }));
}

export async function findVocabularyItemForImport(sourceText, sourceLang, levelId, connection = null) {
  const rows = await query(
    `SELECT * FROM VocabularyItem WHERE sourceText = ? AND sourceLang = ? AND levelId = ? LIMIT 1`,
    [sourceText, sourceLang, levelId],
    connection,
  );
  return rows[0] ?? null;
}

export async function createVocabularyItem(data, connection = null) {
  const id = generateId();
  const ts = now();
  await query(
    `INSERT INTO VocabularyItem (id, sourceText, targetText, sourceLang, targetLang, pronunciationText, exampleSentence, exampleTranslation, audioUrl, type, difficultyScore, levelId, categoryId, \`order\`, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.sourceText,
      data.targetText,
      data.sourceLang,
      data.targetLang,
      data.pronunciationText ?? null,
      data.exampleSentence ?? null,
      data.exampleTranslation ?? null,
      data.audioUrl ?? null,
      data.type ?? 'word',
      data.difficultyScore ?? 1,
      data.levelId,
      data.categoryId ?? null,
      data.order ?? 0,
      data.isActive !== false ? 1 : 0,
      ts,
      ts,
    ],
    connection,
  );
  const rows = await query('SELECT * FROM VocabularyItem WHERE id = ? LIMIT 1', [id], connection);
  return rows[0];
}

export async function updateVocabularyItem(id, data, connection = null) {
  const fields = [];
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      const col = key === 'order' ? '`order`' : key;
      fields.push(`${col} = ?`);
      params.push(value);
    }
  }
  if (fields.length === 0) return;
  fields.push('updatedAt = ?');
  params.push(now(), id);
  await query(`UPDATE VocabularyItem SET ${fields.join(', ')} WHERE id = ?`, params, connection);
}

export async function upsertVocabularyTranslationRow(
  vocabularyItemId,
  targetLang,
  targetText,
  exampleTranslation,
  connection = null,
) {
  const existing = await query(
    `SELECT id FROM VocabularyTranslation WHERE vocabularyItemId = ? AND targetLang = ? LIMIT 1`,
    [vocabularyItemId, targetLang],
    connection,
  );

  if (existing[0]) {
    await query(
      `UPDATE VocabularyTranslation SET targetText = ?, exampleTranslation = ?, updatedAt = ? WHERE id = ?`,
      [targetText, exampleTranslation ?? null, now(), existing[0].id],
      connection,
    );
    return;
  }

  const id = generateId();
  const ts = now();
  await query(
    `INSERT INTO VocabularyTranslation (id, vocabularyItemId, targetLang, targetText, exampleTranslation, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, vocabularyItemId, targetLang, targetText, exampleTranslation ?? null, ts, ts],
    connection,
  );
}

export async function runImportTransaction(callback) {
  return withTransaction(callback);
}

export async function countLevels() {
  const rows = await query('SELECT COUNT(*) AS cnt FROM Level');
  return Number(rows[0]?.cnt ?? 0);
}

export async function upsertLevelByCode(code) {
  const existing = await query('SELECT * FROM Level WHERE code = ? LIMIT 1', [code]);
  const ts = now();
  if (existing[0]) {
    await query('UPDATE Level SET name = ?, isActive = 1, updatedAt = ? WHERE id = ?', [
      code,
      ts,
      existing[0].id,
    ]);
    return (await query('SELECT * FROM Level WHERE id = ? LIMIT 1', [existing[0].id]))[0];
  }

  const count = await countLevels();
  const id = generateId();
  await query(
    `INSERT INTO Level (id, code, name, \`order\`, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [id, code, code, count + 1, ts, ts],
  );
  return (await query('SELECT * FROM Level WHERE id = ? LIMIT 1', [id]))[0];
}

export async function upsertCategoryBySlug(slug, name) {
  const existing = await query('SELECT * FROM Category WHERE slug = ? LIMIT 1', [slug]);
  const ts = now();
  if (existing[0]) {
    await query('UPDATE Category SET name = ?, isActive = 1, updatedAt = ? WHERE id = ?', [
      name,
      ts,
      existing[0].id,
    ]);
    return (await query('SELECT * FROM Category WHERE id = ? LIMIT 1', [existing[0].id]))[0];
  }

  const id = generateId();
  await query(
    `INSERT INTO Category (id, name, slug, isActive, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)`,
    [id, name, slug, ts, ts],
  );
  return (await query('SELECT * FROM Category WHERE id = ? LIMIT 1', [id]))[0];
}

// --- User vocabulary progress ---

const PROGRESS_VOCAB_JOIN = `
  SELECT uvp.*,
    vi.id AS vi_id, vi.sourceText, vi.targetText, vi.sourceLang, vi.targetLang AS vi_targetLang,
    vi.pronunciationText, vi.exampleSentence, vi.exampleTranslation, vi.audioUrl, vi.type,
    vi.difficultyScore, vi.levelId, vi.categoryId, vi.\`order\` AS vi_order, vi.isActive,
    l.id AS level_id, l.code AS level_code, l.name AS level_name, l.\`order\` AS level_order, l.isActive AS level_isActive,
    c.id AS cat_id, c.name AS cat_name, c.slug AS cat_slug, c.isActive AS cat_isActive
  FROM UserVocabularyProgress uvp
  JOIN VocabularyItem vi ON uvp.vocabularyItemId = vi.id
  JOIN Level l ON vi.levelId = l.id
  LEFT JOIN Category c ON vi.categoryId = c.id`;

function mapProgressRow(row) {
  const progress = {
    id: row.id,
    userId: row.userId,
    vocabularyItemId: row.vocabularyItemId,
    status: row.status,
    seenCount: row.seenCount,
    correctCount: row.correctCount,
    wrongCount: row.wrongCount,
    totalAnswerTimeMs: row.totalAnswerTimeMs,
    answerCount: row.answerCount,
    lastSeenAt: row.lastSeenAt,
    learnedAt: row.learnedAt,
    isSaved: Boolean(row.isSaved),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  progress.vocabularyItem = {
    id: row.vi_id,
    sourceText: row.sourceText,
    targetText: row.targetText,
    sourceLang: row.sourceLang,
    targetLang: row.vi_targetLang,
    pronunciationText: row.pronunciationText,
    exampleSentence: row.exampleSentence,
    exampleTranslation: row.exampleTranslation,
    audioUrl: row.audioUrl,
    type: row.type,
    difficultyScore: row.difficultyScore,
    levelId: row.levelId,
    categoryId: row.categoryId,
    order: row.vi_order,
    isActive: Boolean(row.isActive),
    level: row.level_id
      ? {
          id: row.level_id,
          code: row.level_code,
          name: row.level_name,
          order: row.level_order,
          isActive: Boolean(row.level_isActive),
        }
      : null,
    category: row.cat_id
      ? {
          id: row.cat_id,
          name: row.cat_name,
          slug: row.cat_slug,
          isActive: Boolean(row.cat_isActive),
        }
      : null,
  };

  return progress;
}

export async function findVocabularyProgressByUserAndItem(userId, vocabularyItemId) {
  const rows = await query(
    'SELECT * FROM UserVocabularyProgress WHERE userId = ? AND vocabularyItemId = ? LIMIT 1',
    [userId, vocabularyItemId],
  );
  return rows[0] ?? null;
}

export async function findVocabularyProgressWithItem(userId, vocabularyItemId) {
  const rows = await query(
    `${PROGRESS_VOCAB_JOIN} WHERE uvp.userId = ? AND uvp.vocabularyItemId = ? LIMIT 1`,
    [userId, vocabularyItemId],
  );
  return rows[0] ? mapProgressRow(rows[0]) : null;
}

export async function findVocabularyProgressByUser(userId) {
  const rows = await query(
    `${PROGRESS_VOCAB_JOIN} WHERE uvp.userId = ? ORDER BY uvp.updatedAt DESC`,
    [userId],
  );
  return rows.map(mapProgressRow);
}

export async function findVocabularyProgressByItemIds(userId, itemIds) {
  if (itemIds.length === 0) return [];
  const placeholders = itemIds.map(() => '?').join(',');
  return query(
    `SELECT * FROM UserVocabularyProgress WHERE userId = ? AND vocabularyItemId IN (${placeholders})`,
    [userId, ...itemIds],
  );
}

export async function findSavedVocabularyProgress(userId, sourceLang, translationLangs) {
  const rows = await query(
    `${PROGRESS_VOCAB_JOIN}
     WHERE uvp.userId = ? AND uvp.isSaved = 1 AND vi.isActive = 1 AND vi.sourceLang = ?
     ORDER BY uvp.updatedAt DESC`,
    [userId, sourceLang],
  );
  const progressList = rows.map(mapProgressRow);
  const itemIds = progressList.map((p) => p.vocabularyItem.id);
  const translationsByItem = await loadTranslationsForItems(itemIds, translationLangs);

  return progressList.map((p) => ({
    ...p,
    vocabularyItem: {
      ...p.vocabularyItem,
      translations: translationsByItem.get(p.vocabularyItem.id) ?? [],
    },
  }));
}

export async function createVocabularyProgress(data) {
  const id = generateId();
  const ts = now();
  await query(
    `INSERT INTO UserVocabularyProgress (id, userId, vocabularyItemId, status, seenCount, correctCount, wrongCount, totalAnswerTimeMs, answerCount, lastSeenAt, learnedAt, isSaved, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.userId,
      data.vocabularyItemId,
      data.status ?? 'learning',
      data.seenCount ?? 0,
      data.correctCount ?? 0,
      data.wrongCount ?? 0,
      data.totalAnswerTimeMs ?? 0,
      data.answerCount ?? 0,
      data.lastSeenAt ?? null,
      data.learnedAt ?? null,
      data.isSaved ? 1 : 0,
      ts,
      ts,
    ],
  );
  return findVocabularyProgressWithItem(data.userId, data.vocabularyItemId);
}

export async function updateVocabularyProgress(id, data) {
  const sets = [];
  const params = [];

  const fieldMap = {
    seenCount: 'seenCount',
    correctCount: 'correctCount',
    wrongCount: 'wrongCount',
    answerCount: 'answerCount',
    totalAnswerTimeMs: 'totalAnswerTimeMs',
    lastSeenAt: 'lastSeenAt',
    learnedAt: 'learnedAt',
    status: 'status',
    isSaved: 'isSaved',
  };

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (key.endsWith('Increment')) {
      const base = key.replace('Increment', '');
      const col = fieldMap[base] ?? base;
      sets.push(`${col} = ${col} + ?`);
      params.push(value);
    } else if (fieldMap[key]) {
      sets.push(`${fieldMap[key]} = ?`);
      params.push(key === 'isSaved' ? (value ? 1 : 0) : value);
    }
  }

  if (sets.length === 0) return;

  sets.push('updatedAt = ?');
  params.push(now(), id);
  await query(`UPDATE UserVocabularyProgress SET ${sets.join(', ')} WHERE id = ?`, params);

  const row = await query('SELECT userId, vocabularyItemId FROM UserVocabularyProgress WHERE id = ?', [
    id,
  ]);
  if (!row[0]) return null;
  return findVocabularyProgressWithItem(row[0].userId, row[0].vocabularyItemId);
}

export async function upsertVocabularyProgressSeen(userId, vocabularyItemId) {
  const existing = await findVocabularyProgressByUserAndItem(userId, vocabularyItemId);
  const ts = now();

  if (existing) {
    await updateVocabularyProgress(existing.id, {
      seenCountIncrement: 1,
      lastSeenAt: ts,
    });
    return findVocabularyProgressWithItem(userId, vocabularyItemId);
  }

  return createVocabularyProgress({
    userId,
    vocabularyItemId,
    seenCount: 1,
    lastSeenAt: ts,
    status: 'learning',
  });
}

export async function upsertVocabularyProgressAnswer(userId, vocabularyItemId, payload) {
  const existing = await findVocabularyProgressByUserAndItem(userId, vocabularyItemId);
  const ts = now();

  if (!existing) {
    return createVocabularyProgress({
      userId,
      vocabularyItemId,
      seenCount: 1,
      correctCount: payload.correctCount,
      wrongCount: payload.wrongCount,
      answerCount: 1,
      totalAnswerTimeMs: payload.totalAnswerTimeMs,
      lastSeenAt: ts,
      learnedAt: payload.learnedAt,
      status: payload.status,
    });
  }

  await updateVocabularyProgress(existing.id, {
    seenCountIncrement: 1,
    correctCountIncrement: payload.correctDelta,
    wrongCountIncrement: payload.wrongDelta,
    answerCountIncrement: 1,
    totalAnswerTimeMsIncrement: payload.totalAnswerTimeMs,
    lastSeenAt: ts,
    learnedAt: payload.learnedAt,
    status: payload.status,
  });

  return findVocabularyProgressWithItem(userId, vocabularyItemId);
}

export async function toggleSavedVocabularyProgress(userId, vocabularyItemId) {
  const existing = await findVocabularyProgressByUserAndItem(userId, vocabularyItemId);
  if (existing) {
    await updateVocabularyProgress(existing.id, { isSaved: !existing.isSaved });
    return findVocabularyProgressWithItem(userId, vocabularyItemId);
  }

  return createVocabularyProgress({
    userId,
    vocabularyItemId,
    isSaved: true,
    status: 'learning',
  });
}
