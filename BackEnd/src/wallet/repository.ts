import { Prisma, PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import type { AuditLogInput, StoredWalletNonce, WalletSessionRecord } from "./types.js";

function sanitizeAuditDetails(details: AuditLogInput["details"]): Prisma.InputJsonValue | undefined {
  if (!details) return undefined;
  return JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue;
}

export interface WalletRepository {
  readonly storageMode: "memory" | "prisma";
  createAuthNonce(input: { walletAddress: string; nonce: string; message: string; expiresAt: Date }): Promise<StoredWalletNonce>;
  consumeAuthNonce(id: string, walletAddress: string): Promise<StoredWalletNonce | null>;
  findOrCreateWallet(address: string): Promise<WalletSessionRecord>;
  getWalletByAddress(address: string): Promise<WalletSessionRecord | null>;
  touchWalletAuthenticated(walletId: number, authenticatedAt: Date): Promise<void>;
  appendAuditLog(input: AuditLogInput): Promise<void>;
  disconnect(): Promise<void>;
}

interface InMemoryWalletRecord extends WalletSessionRecord {}

class InMemoryWalletRepository implements WalletRepository {
  readonly storageMode = "memory" as const;

  private readonly nonces = new Map<string, StoredWalletNonce & { usedAt?: Date }>();
  private readonly wallets = new Map<string, InMemoryWalletRecord>();
  private nextWalletId = 1;
  private nextUserId = 1;

  async createAuthNonce(input: {
    walletAddress: string;
    nonce: string;
    message: string;
    expiresAt: Date;
  }): Promise<StoredWalletNonce> {
    const record: StoredWalletNonce = {
      id: `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      walletAddress: input.walletAddress,
      nonce: input.nonce,
      message: input.message,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    };

    this.nonces.set(record.id, record);
    return record;
  }

  async consumeAuthNonce(id: string, walletAddress: string): Promise<StoredWalletNonce | null> {
    const record = this.nonces.get(id);
    if (!record || record.walletAddress !== walletAddress) {
      return null;
    }
    if ("usedAt" in record || record.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    this.nonces.set(id, {
      ...record,
      usedAt: new Date(),
    });

    return record;
  }

  async findOrCreateWallet(address: string): Promise<WalletSessionRecord> {
    const existing = this.wallets.get(address);
    if (existing) {
      return existing;
    }

    const wallet: InMemoryWalletRecord = {
      walletId: this.nextWalletId++,
      userId: this.nextUserId++,
      address,
      lastAuthenticatedAt: null,
    };

    this.wallets.set(address, wallet);
    return wallet;
  }

  async getWalletByAddress(address: string): Promise<WalletSessionRecord | null> {
    return this.wallets.get(address) ?? null;
  }

  async touchWalletAuthenticated(walletId: number, authenticatedAt: Date): Promise<void> {
    for (const [address, wallet] of this.wallets.entries()) {
      if (wallet.walletId !== walletId) continue;
      this.wallets.set(address, {
        ...wallet,
        lastAuthenticatedAt: authenticatedAt,
      });
      return;
    }
  }

  async appendAuditLog(_input: AuditLogInput): Promise<void> {
    // Memory mode keeps the app usable when DATABASE_URL is not configured.
  }

  async disconnect(): Promise<void> {
    // No-op in memory mode.
  }
}

class PrismaWalletRepository implements WalletRepository {
  readonly storageMode = "prisma" as const;

  constructor(private readonly prisma: PrismaClient) {}

  async createAuthNonce(input: {
    walletAddress: string;
    nonce: string;
    message: string;
    expiresAt: Date;
  }): Promise<StoredWalletNonce> {
    const created = await this.prisma.authNonce.create({
      data: {
        walletAddress: input.walletAddress,
        nonce: input.nonce,
        message: input.message,
        expiresAt: input.expiresAt,
      },
    });

    return {
      id: created.id,
      walletAddress: created.walletAddress,
      nonce: created.nonce,
      message: created.message,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    };
  }

  async consumeAuthNonce(id: string, walletAddress: string): Promise<StoredWalletNonce | null> {
    return this.prisma.$transaction(async (transaction) => {
      const found = await transaction.authNonce.findFirst({
        where: {
          id,
          walletAddress,
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (!found) {
        return null;
      }

      const updated = await transaction.authNonce.updateMany({
        where: {
          id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      return {
        id: found.id,
        walletAddress: found.walletAddress,
        nonce: found.nonce,
        message: found.message,
        expiresAt: found.expiresAt,
        createdAt: found.createdAt,
      };
    });
  }

  async findOrCreateWallet(address: string): Promise<WalletSessionRecord> {
    const existing = await this.prisma.wallet.findUnique({
      where: {
        address,
      },
    });

    if (existing) {
      return {
        walletId: existing.id,
        userId: existing.userId,
        address: existing.address,
        lastAuthenticatedAt: existing.lastAuthenticatedAt,
      };
    }

    const created = await this.prisma.user.create({
      data: {
        wallets: {
          create: {
            address,
            provider: "phantom",
          },
        },
      },
      include: {
        wallets: true,
      },
    });

    const wallet = created.wallets[0];
    return {
      walletId: wallet.id,
      userId: created.id,
      address: wallet.address,
      lastAuthenticatedAt: wallet.lastAuthenticatedAt,
    };
  }

  async getWalletByAddress(address: string): Promise<WalletSessionRecord | null> {
    const wallet = await this.prisma.wallet.findUnique({
      where: {
        address,
      },
    });

    if (!wallet) return null;

    return {
      walletId: wallet.id,
      userId: wallet.userId,
      address: wallet.address,
      lastAuthenticatedAt: wallet.lastAuthenticatedAt,
    };
  }

  async touchWalletAuthenticated(walletId: number, authenticatedAt: Date): Promise<void> {
    await this.prisma.wallet.update({
      where: {
        id: walletId,
      },
      data: {
        lastAuthenticatedAt: authenticatedAt,
      },
    });
  }

  async appendAuditLog(input: AuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        status: input.status,
        userId: input.userId,
        walletId: input.walletId,
        details: sanitizeAuditDetails(input.details),
      },
    });
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export function createWalletRepository(logger: Logger): WalletRepository {
  if (!process.env.DATABASE_URL?.trim()) {
    logger.warn("DATABASE_URL is not configured. Wallet auth will run in non-persistent memory mode.");
    return new InMemoryWalletRepository();
  }

  return new PrismaWalletRepository(new PrismaClient());
}
