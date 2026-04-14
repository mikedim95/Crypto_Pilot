CREATE TABLE `User` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Wallet` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `address` VARCHAR(64) NOT NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'phantom',
  `lastAuthenticatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `userId` INTEGER NOT NULL,
  UNIQUE INDEX `Wallet_address_key`(`address`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthNonce` (
  `id` VARCHAR(191) NOT NULL,
  `walletAddress` VARCHAR(64) NOT NULL,
  `nonce` VARCHAR(128) NOT NULL,
  `message` TEXT NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuthNonce_walletAddress_expiresAt_idx`(`walletAddress`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `details` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `userId` INTEGER NULL,
  `walletId` INTEGER NULL,
  INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
  INDEX `AuditLog_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `AuditLog_walletId_createdAt_idx`(`walletId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Wallet`
  ADD CONSTRAINT `Wallet_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `AuditLog`
  ADD CONSTRAINT `AuditLog_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `AuditLog`
  ADD CONSTRAINT `AuditLog_walletId_fkey`
  FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
