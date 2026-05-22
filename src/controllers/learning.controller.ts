import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, message });
}

export async function getLanguages(_req: Request, res: Response) {
  try {
    const languages = await prisma.language.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return sendSuccess(res, languages);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch languages');
  }
}

export async function getLevels(_req: Request, res: Response) {
  try {
    const levels = await prisma.level.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    return sendSuccess(res, levels);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch levels');
  }
}

export async function getCategories(_req: Request, res: Response) {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return sendSuccess(res, categories);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch categories');
  }
}

export async function getLessons(req: Request, res: Response) {
  try {
    const { language, level, category } = req.query;

    const where: Prisma.LessonWhereInput = { isActive: true };

    if (typeof language === 'string' && language.length > 0) {
      where.language = { code: language, isActive: true };
    }
    if (typeof level === 'string' && level.length > 0) {
      where.level = { code: level, isActive: true };
    }
    if (typeof category === 'string' && category.length > 0) {
      where.category = { slug: category, isActive: true };
    }

    const lessons = await prisma.lesson.findMany({
      where,
      include: {
        language: true,
        level: true,
        category: true,
      },
      orderBy: { order: 'asc' },
    });

    return sendSuccess(res, lessons);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch lessons');
  }
}

export async function getLessonById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const lesson = await prisma.lesson.findFirst({
      where: { id, isActive: true },
      include: {
        language: true,
        level: true,
        category: true,
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!lesson) {
      return sendError(res, 'Lesson not found', 404);
    }

    return sendSuccess(res, lesson);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch lesson');
  }
}

export async function getLessonItems(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const lesson = await prisma.lesson.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });

    if (!lesson) {
      return sendError(res, 'Lesson not found', 404);
    }

    const items = await prisma.lessonItem.findMany({
      where: { lessonId: id },
      orderBy: { order: 'asc' },
    });

    return sendSuccess(res, items);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch lesson items');
  }
}
