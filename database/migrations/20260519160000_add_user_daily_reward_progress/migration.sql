-- CreateTable
CREATE TABLE `UserDailyRewardProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `learnedWordCount` INTEGER NOT NULL DEFAULT 0,
    `speakingPracticeCount` INTEGER NOT NULL DEFAULT 0,
    `testAnswerCount` INTEGER NOT NULL DEFAULT 0,
    `reviewWordCount` INTEGER NOT NULL DEFAULT 0,
    `reviewCorrectCount` INTEGER NOT NULL DEFAULT 0,
    `learnedRewardClaimCount` INTEGER NOT NULL DEFAULT 0,
    `speakingRewardClaimCount` INTEGER NOT NULL DEFAULT 0,
    `testRewardClaimCount` INTEGER NOT NULL DEFAULT 0,
    `reviewRewardClaimCount` INTEGER NOT NULL DEFAULT 0,
    `earnedGems` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserDailyRewardProgress_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserDailyRewardProgress` ADD CONSTRAINT `UserDailyRewardProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
