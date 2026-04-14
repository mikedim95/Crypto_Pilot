import { Connection, PublicKey } from "@solana/web3.js";
import { WALLET_TOKENS, fromAtomicAmount } from "./constants.js";
import type { WalletBalanceRecord } from "./types.js";

function sumAtomicTokenAmounts(rawAmounts: string[]): string {
  const total = rawAmounts.reduce((sum, value) => sum + BigInt(value || "0"), 0n);
  return total.toString();
}

export async function loadTrackedBalances(connection: Connection, address: string): Promise<WalletBalanceRecord[]> {
  const owner = new PublicKey(address);
  const solLamports = await connection.getBalance(owner, "confirmed");
  const usdcAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
    mint: new PublicKey(WALLET_TOKENS.USDC.mint),
  });

  const usdcAtomicAmount = sumAtomicTokenAmounts(
    usdcAccounts.value.map((account) => {
      const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
      return typeof tokenAmount === "string" ? tokenAmount : "0";
    })
  );

  return [
    {
      symbol: "SOL",
      mint: WALLET_TOKENS.SOL.mint,
      decimals: WALLET_TOKENS.SOL.decimals,
      atomicAmount: solLamports.toString(),
      amount: fromAtomicAmount(solLamports.toString(), WALLET_TOKENS.SOL.decimals),
    },
    {
      symbol: "USDC",
      mint: WALLET_TOKENS.USDC.mint,
      decimals: WALLET_TOKENS.USDC.decimals,
      atomicAmount: usdcAtomicAmount,
      amount: fromAtomicAmount(usdcAtomicAmount, WALLET_TOKENS.USDC.decimals),
    },
  ];
}
