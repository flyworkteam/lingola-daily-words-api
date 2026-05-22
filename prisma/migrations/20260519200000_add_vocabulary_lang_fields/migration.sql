-- AlterTable
ALTER TABLE `VocabularyItem` ADD COLUMN `sourceLang` VARCHAR(191) NOT NULL DEFAULT 'en',
    ADD COLUMN `targetLang` VARCHAR(191) NOT NULL DEFAULT 'tr';

-- Existing Turkish vocabulary rows
UPDATE `VocabularyItem` SET `sourceLang` = 'en', `targetLang` = 'tr';
