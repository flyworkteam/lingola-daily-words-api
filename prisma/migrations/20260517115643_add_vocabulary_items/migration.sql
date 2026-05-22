-- CreateTable
CREATE TABLE `VocabularyItem` (
    `id` VARCHAR(191) NOT NULL,
    `sourceText` VARCHAR(191) NOT NULL,
    `targetText` VARCHAR(191) NOT NULL,
    `phonetic` VARCHAR(191) NULL,
    `exampleSentence` VARCHAR(191) NULL,
    `exampleTranslation` VARCHAR(191) NULL,
    `audioUrl` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'word',
    `levelId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserVocabularyProgress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `vocabularyItemId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'learning',
    `seenCount` INTEGER NOT NULL DEFAULT 0,
    `correctCount` INTEGER NOT NULL DEFAULT 0,
    `wrongCount` INTEGER NOT NULL DEFAULT 0,
    `lastSeenAt` DATETIME(3) NULL,
    `learnedAt` DATETIME(3) NULL,
    `isSaved` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserVocabularyProgress_userId_vocabularyItemId_key`(`userId`, `vocabularyItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VocabularyItem` ADD CONSTRAINT `VocabularyItem_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Level`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VocabularyItem` ADD CONSTRAINT `VocabularyItem_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserVocabularyProgress` ADD CONSTRAINT `UserVocabularyProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserVocabularyProgress` ADD CONSTRAINT `UserVocabularyProgress_vocabularyItemId_fkey` FOREIGN KEY (`vocabularyItemId`) REFERENCES `VocabularyItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
