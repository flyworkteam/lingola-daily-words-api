-- CreateTable
CREATE TABLE `RequestIdempotency` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(64) NOT NULL,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `statusCode` INTEGER NOT NULL,
    `responseBody` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `RequestIdempotency_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `RequestIdempotency_userId_scope_idempotencyKey_key`(`userId`, `scope`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RequestIdempotency` ADD CONSTRAINT `RequestIdempotency_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
