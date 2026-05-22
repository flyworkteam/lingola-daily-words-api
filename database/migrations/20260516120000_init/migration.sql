-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `firebaseUid` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NULL,
    `photoUrl` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_firebaseUid_key`(`firebaseUid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
