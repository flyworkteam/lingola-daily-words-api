-- AlterTable
ALTER TABLE `VocabularyItem` ADD COLUMN `difficultyScore` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `UserLearningProfile` ADD COLUMN `currentDifficulty` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `UserVocabularyProgress` ADD COLUMN `totalAnswerTimeMs` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `answerCount` INTEGER NOT NULL DEFAULT 0;
