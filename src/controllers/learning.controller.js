import {
  findActiveCategories,
  findActiveLanguages,
  findActiveLevels,
  findLessonById,
  findLessonItems,
  findLessons,
} from '../db/repositories.js';

function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res, message, status = 500) {
  return res.status(status).json({ success: false, message });
}

export async function getLanguages(_req, res) {
  try {
    const languages = await findActiveLanguages();
    return sendSuccess(res, languages);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch languages');
  }
}

export async function getLevels(_req, res) {
  try {
    const levels = await findActiveLevels();
    return sendSuccess(res, levels);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch levels');
  }
}

export async function getCategories(_req, res) {
  try {
    const categories = await findActiveCategories();
    return sendSuccess(res, categories);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch categories');
  }
}

export async function getLessons(req, res) {
  try {
    const { language, level, category } = req.query;
    const filters = {};

    if (typeof language === 'string' && language.length > 0) {
      filters.languageCode = language;
    }
    if (typeof level === 'string' && level.length > 0) {
      filters.levelCode = level;
    }
    if (typeof category === 'string' && category.length > 0) {
      filters.categorySlug = category;
    }

    const lessons = await findLessons(filters);
    return sendSuccess(res, lessons);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch lessons');
  }
}

export async function getLessonById(req, res) {
  try {
    const { id } = req.params;
    const lesson = await findLessonById(id, true);

    if (!lesson) {
      return sendError(res, 'Lesson not found', 404);
    }

    return sendSuccess(res, lesson);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch lesson');
  }
}

export async function getLessonItems(req, res) {
  try {
    const { id } = req.params;
    const items = await findLessonItems(id);

    if (items === null) {
      return sendError(res, 'Lesson not found', 404);
    }

    return sendSuccess(res, items);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch lesson items');
  }
}
