-- CreateTable
CREATE TABLE `UserLearningProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `currentLevel` VARCHAR(191) NOT NULL DEFAULT 'A1',
    `targetLang` VARCHAR(191) NOT NULL DEFAULT 'tr',
    `sourceLang` VARCHAR(191) NOT NULL DEFAULT 'en',
    `dailyGoal` INTEGER NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserLearningProfile_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserLearningProfile` ADD CONSTRAINT `UserLearningProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
