-- CreateTable
CREATE TABLE `VocabularyTranslation` (
    `id` VARCHAR(191) NOT NULL,
    `vocabularyItemId` VARCHAR(191) NOT NULL,
    `targetLang` VARCHAR(191) NOT NULL,
    `targetText` VARCHAR(191) NOT NULL,
    `exampleTranslation` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VocabularyTranslation_vocabularyItemId_targetLang_key`(`vocabularyItemId`, `targetLang`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill Turkish meanings from existing vocabulary rows
INSERT INTO `VocabularyTranslation` (`id`, `vocabularyItemId`, `targetLang`, `targetText`, `exampleTranslation`, `createdAt`, `updatedAt`)
SELECT
    CONCAT(`id`, '_tr'),
    `id`,
    `targetLang`,
    `targetText`,
    `exampleTranslation`,
    `createdAt`,
    `updatedAt`
FROM `VocabularyItem`;

-- AddForeignKey
ALTER TABLE `VocabularyTranslation` ADD CONSTRAINT `VocabularyTranslation_vocabularyItemId_fkey` FOREIGN KEY (`vocabularyItemId`) REFERENCES `VocabularyItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
