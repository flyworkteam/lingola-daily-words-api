import {
  createUserLearningProfile,
  ensureUserStats,
  findUserLearningProfile,
} from '../db/repositories.js';
import {
  DEFAULT_TARGET_LANG,
  FIXED_SOURCE_LANG,
} from '../constants/supportedLanguages.js';

const DEFAULT_PROFILE = {
  currentLevel: 'A1',
  currentDifficulty: 1,
  sourceLang: FIXED_SOURCE_LANG,
  targetLang: DEFAULT_TARGET_LANG,
  dailyGoal: 10,
};

/** Ensures new Firebase users can use vocabulary endpoints immediately. */
export async function ensureUserOnboarding(userId) {
  await ensureUserStats(userId);
  const profile = await findUserLearningProfile(userId);
  if (!profile) {
    await createUserLearningProfile({
      userId,
      ...DEFAULT_PROFILE,
    });
  }
}
