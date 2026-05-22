-- AlterTable
ALTER TABLE `UserStats` ADD COLUMN `gems` INTEGER NOT NULL DEFAULT 0;

-- Backfill gems from legacy coins balance
UPDATE `UserStats` SET `gems` = `coins` WHERE `gems` = 0 AND `coins` > 0;
