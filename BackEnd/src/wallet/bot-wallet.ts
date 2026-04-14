import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import type { WalletBalanceRecord } from "./types.js";

export interface BotWalletStatus {
  configured: boolean;
  address?: string;
  balances?: WalletBalanceRecord[];
  note: string;
}

interface BotWalletLogger {
  warn(bindings: Record<string, unknown>, message?: string): void;
}

export function resolveBotWalletAddress(logger: BotWalletLogger): string | null {
  const secret = process.env.BOT_SECRET_KEY_BASE58?.trim();
  if (!secret) {
    return null;
  }

  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(secret));
    return keypair.publicKey.toBase58();
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "BOT_SECRET_KEY_BASE58 is present but invalid."
    );
    return null;
  }
}

export async function getBotWalletStatus(
  logger: BotWalletLogger,
  readBalances: (address: string) => Promise<WalletBalanceRecord[]>
): Promise<BotWalletStatus> {
  const address = resolveBotWalletAddress(logger);

  if (!process.env.BOT_SECRET_KEY_BASE58?.trim()) {
    return {
      configured: false,
      note: "Bot wallet is not configured yet. When you add it on the Pi, keep it separate from Phantom.",
    };
  }

  if (!address) {
    return {
      configured: false,
      note: "BOT_SECRET_KEY_BASE58 is set but invalid. Fix the Pi bot wallet config before enabling automation.",
    };
  }

  const balances = await readBalances(address);
  return {
    configured: true,
    address,
    balances,
    note: "Bot wallet is configured separately from Phantom and should remain on the Pi only.",
  };
}
