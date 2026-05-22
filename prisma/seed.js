require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const LESSON_TITLE = 'Günlük Selamlaşmalar';

const LESSON_ITEMS = [
  { type: 'phrase', sourceText: 'Hello', targetText: 'Merhaba', order: 1 },
  { type: 'phrase', sourceText: 'Good morning', targetText: 'Günaydın', order: 2 },
  { type: 'phrase', sourceText: 'How are you?', targetText: 'Nasılsın?', order: 3 },
  { type: 'phrase', sourceText: 'I am fine', targetText: 'İyiyim', order: 4 },
  { type: 'phrase', sourceText: 'See you later', targetText: 'Sonra görüşürüz', order: 5 },
];

const VOCABULARY_ITEMS = [
  {
    sourceText: 'Journey',
    targetText: 'Yolculuk',
    pronunciationText: 'cörni',
    order: 1,
  },
  {
    sourceText: 'Meticulous',
    targetText: 'Titiz',
    pronunciationText: 'metikyulıs',
    order: 2,
  },
  {
    sourceText: 'Improve',
    targetText: 'Geliştirmek',
    pronunciationText: 'impruuv',
    order: 3,
  },
  {
    sourceText: 'Comfort',
    targetText: 'Rahatlık',
    pronunciationText: 'kamfırt',
    order: 4,
  },
  {
    sourceText: 'Discover',
    targetText: 'Keşfetmek',
    pronunciationText: 'diskavır',
    order: 5,
  },
];

async function upsertVocabularyItem({ levelId, categoryId, item }) {
  const targetLang = item.targetLang ?? 'tr';

  const existing = await prisma.vocabularyItem.findFirst({
    where: {
      sourceText: item.sourceText,
      sourceLang: item.sourceLang ?? 'en',
      levelId,
    },
  });

  const data = {
    sourceText: item.sourceText,
    targetText: item.targetText,
    sourceLang: item.sourceLang ?? 'en',
    targetLang,
    pronunciationText: item.pronunciationText ?? null,
    type: item.type ?? 'word',
    levelId,
    categoryId,
    order: item.order,
    isActive: true,
  };

  const vocabularyItem = existing
    ? await prisma.vocabularyItem.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.vocabularyItem.create({ data });

  await prisma.vocabularyTranslation.upsert({
    where: {
      vocabularyItemId_targetLang: {
        vocabularyItemId: vocabularyItem.id,
        targetLang,
      },
    },
    create: {
      vocabularyItemId: vocabularyItem.id,
      targetLang,
      targetText: item.targetText,
      exampleTranslation: null,
    },
    update: {
      targetText: item.targetText,
    },
  });

  return vocabularyItem;
}

async function main() {
  const language = await prisma.language.upsert({
    where: { code: 'en' },
    update: { name: 'English', isActive: true },
    create: { code: 'en', name: 'English', isActive: true },
  });

  const level = await prisma.level.upsert({
    where: { code: 'A1' },
    update: { name: 'A1', order: 1, isActive: true },
    create: { code: 'A1', name: 'A1', order: 1, isActive: true },
  });

  const category = await prisma.category.upsert({
    where: { slug: 'daily-life' },
    update: { name: 'Daily Life', isActive: true },
    create: { name: 'Daily Life', slug: 'daily-life', isActive: true },
  });

  let lesson = await prisma.lesson.findFirst({
    where: {
      title: LESSON_TITLE,
      languageId: language.id,
      levelId: level.id,
      categoryId: category.id,
    },
  });

  if (!lesson) {
    lesson = await prisma.lesson.create({
      data: {
        title: LESSON_TITLE,
        languageId: language.id,
        levelId: level.id,
        categoryId: category.id,
        order: 1,
        isFree: true,
        isActive: true,
      },
    });
  } else {
    lesson = await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        order: 1,
        isFree: true,
        isActive: true,
      },
    });
  }

  await prisma.lessonItem.deleteMany({
    where: { lessonId: lesson.id },
  });

  await prisma.lessonItem.createMany({
    data: LESSON_ITEMS.map((item) => ({
      lessonId: lesson.id,
      type: item.type,
      sourceText: item.sourceText,
      targetText: item.targetText,
      order: item.order,
    })),
  });

  const vocabularyItems = [];
  for (const item of VOCABULARY_ITEMS) {
    const vocabularyItem = await upsertVocabularyItem({
      levelId: level.id,
      categoryId: category.id,
      item,
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
  .finally(async () => {
    await prisma.$disconnect();
  });
