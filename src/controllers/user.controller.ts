import type { Request, Response } from 'express';
import type { UserLearningProfile } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { getHomeSummary } from '../services/homeSummary.service.js';
import {
  DEFAULT_TARGET_LANG,
  FIXED_SOURCE_LANG,
  normalizeSupportedTargetLang,
  supportedTargetLangSchema,
} from '../constants/supportedLanguages.js';

const VALID_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const DEFAULT_PROFILE = {
  currentLevel: 'A1',
  sourceLang: FIXED_SOURCE_LANG,
  targetLang: DEFAULT_TARGET_LANG,
  dailyGoal: 10,
} as const;

const learningProfileBodySchema = z.object({
  currentLevel: z.enum(VALID_LEVELS),
  targetLang: supportedTargetLangSchema,
  dailyGoal: z.number().int().min(1).max(500),
});

function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, message });
}

function toProfileData(profile: UserLearningProfile) {
  return {
    id: profile.id,
    userId: profile.userId,
    currentLevel: profile.currentLevel,
    sourceLang: FIXED_SOURCE_LANG,
    targetLang: normalizeSupportedTargetLang(profile.targetLang),
    dailyGoal: profile.dailyGoal,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function getAuthUser(req: Request, res: Response) {
  if (!req.user) {
    sendError(res, 'Unauthorized', 401);
    return null;
  }
  return req.user;
}

export async function getLearningProfile(req: Request, res: Response) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const profile = await prisma.userLearningProfile.findUnique({
      where: { userId: user.id },
    });

    if (profile) {
      return sendSuccess(res, toProfileData(profile));
    }

    const created = await prisma.userLearningProfile.create({
      data: {
        userId: user.id,
        ...DEFAULT_PROFILE,
      },
    });

    return sendSuccess(res, toProfileData(created));
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch learning profile');
  }
}

export async function getHomeSummaryHandler(req: Request, res: Response) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const summary = await getHomeSummary(user.id);
    return sendSuccess(res, summary);
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to fetch home summary');
  }
}

export async function saveLearningProfile(req: Request, res: Response) {
  try {
    const user = getAuthUser(req, res);
    if (!user) return;

    const parsed = learningProfileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const targetLangError = parsed.error.issues.find((issue) =>
        issue.path.includes('targetLang'),
      );
      const message = targetLangError?.message ?? 'Invalid request body';
      return sendError(res, message, 400);
    }

    const { currentLevel, targetLang, dailyGoal } = parsed.data;

    const profile = await prisma.userLearningProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        currentLevel,
        sourceLang: FIXED_SOURCE_LANG,
        targetLang,
        dailyGoal,
      },
      update: {
        currentLevel,
        sourceLang: FIXED_SOURCE_LANG,
        targetLang,
        dailyGoal,
      },
    });

    return sendSuccess(res, toProfileData(profile));
  } catch (error) {
    console.error(error);
    return sendError(res, 'Failed to save learning profile');
  }
}
