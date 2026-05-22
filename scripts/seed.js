import 'dotenv/config';
import { generateId } from '../src/db/id.js';
import { getPool, query } from '../src/db/mysql.js';
import { upsertCategoryBySlug, upsertLevelByCode } from '../src/db/repositories.js';
import { findOrCreateVocabularyItemForImport } from '../src/services/vocabularyLanguage.service.js';

const LESSON_TITLE = 'Günlük Selamlaşmalar';

const LESSON_ITEMS = [
  { type: 'phrase', sourceText: 'Hello', targetText: 'Merhaba', order: 1 },
  { type: 'phrase', sourceText: 'Good morning', targetText: 'Günaydın', order: 2 },
  { type: 'phrase', sourceText: 'How are you?', targetText: 'Nasılsın?', order: 3 },
  { type: 'phrase', sourceText: 'I am fine', targetText: 'İyiyim', order: 4 },
  { type: 'phrase', sourceText: 'See you later', targetText: 'Sonra görüşürüz', order: 5 },
];

const VOCABULARY_ITEMS = [
  { sourceText: 'Journey', targetText: 'Yolculuk', pronunciationText: 'cörni', order: 1 },
  { sourceText: 'Meticulous', targetText: 'Titiz', pronunciationText: 'metikyulıs', order: 2 },
  { sourceText: 'Improve', targetText: 'Geliştirmek', pronunciationText: 'impruuv', order: 3 },
  { sourceText: 'Comfort', targetText: 'Rahatlık', pronunciationText: 'kamfırt', order: 4 },
  { sourceText: 'Discover', targetText: 'Keşfetmek', pronunciationText: 'diskavır', order: 5 },
];

async function upsertLanguage(code, name) {
  const existing = await query('SELECT * FROM Language WHERE code = ? LIMIT 1', [code]);
  const ts = new Date();
  if (existing[0]) {
    await query('UPDATE Language SET name = ?, isActive = 1, updatedAt = ? WHERE id = ?', [
      name,
      ts,
      existing[0].id,
    ]);
    return (await query('SELECT * FROM Language WHERE id = ? LIMIT 1', [existing[0].id]))[0];
  }

  const id = generateId();
  await query(
    'INSERT INTO Language (id, code, name, isActive, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)',
    [id, code, name, ts, ts],
  );
  return (await query('SELECT * FROM Language WHERE id = ? LIMIT 1', [id]))[0];
}

async function findOrCreateLesson({ title, languageId, levelId, categoryId }) {
  const rows = await query(
    `SELECT * FROM Lesson WHERE title = ? AND languageId = ? AND levelId = ? AND categoryId = ? LIMIT 1`,
    [title, languageId, levelId, categoryId],
  );

  const ts = new Date();
  if (rows[0]) {
    await query(
      'UPDATE Lesson SET `order` = 1, isFree = 1, isActive = 1, updatedAt = ? WHERE id = ?',
      [ts, rows[0].id],
    );
    return (await query('SELECT * FROM Lesson WHERE id = ? LIMIT 1', [rows[0].id]))[0];
  }

  const id = generateId();
  await query(
    `INSERT INTO Lesson (id, title, languageId, levelId, categoryId, \`order\`, isFree, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`,
    [id, title, languageId, levelId, categoryId, ts, ts],
  );
  return (await query('SELECT * FROM Lesson WHERE id = ? LIMIT 1', [id]))[0];
}

async function replaceLessonItems(lessonId, items) {
  await query('DELETE FROM LessonItem WHERE lessonId = ?', [lessonId]);
  const ts = new Date();

  for (const item of items) {
    const id = generateId();
    await query(
      `INSERT INTO LessonItem (id, lessonId, type, sourceText, targetText, \`order\`, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, lessonId, item.type, item.sourceText, item.targetText, item.order, ts, ts],
    );
  }
}

async function main() {
  const language = await upsertLanguage('en', 'English');
  const level = await upsertLevelByCode('A1');
  const category = await upsertCategoryBySlug('daily-life', 'Daily Life');
  const lesson = await findOrCreateLesson({
    title: LESSON_TITLE,
    languageId: language.id,
    levelId: level.id,
    categoryId: category.id,
  });

  await replaceLessonItems(lesson.id, LESSON_ITEMS);

  const vocabularyItems = [];
  for (const item of VOCABULARY_ITEMS) {
    const vocabularyItem = await findOrCreateVocabularyItemForImport({
      sourceText: item.sourceText,
      targetText: item.targetText,
      levelId: level.id,
      categoryId: category.id,
      targetLang: 'tr',
      pronunciationText: item.pronunciationText ?? null,
    });
    vocabularyItems.push(vocabularyItem);
  }

  console.log('Seed completed:', {
    language: language.code,
    level: level.code,
    category: category.slug,
    lesson: lesson.title,
    lessonItems: LESSON_ITEMS.length,
    vocabularyItems: vocabularyItems.length,
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    getPool().end();
  });
