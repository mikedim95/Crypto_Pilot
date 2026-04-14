import type { WalletTokenSymbol } from "./types.js";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const WALLET_TOKENS: Record<
  WalletTokenSymbol,
  {
    symbol: WalletTokenSymbol;
    mint: string;
    decimals: number;
  }
> = {
  SOL: {
    symbol: "SOL",
    mint: SOL_MINT,
    decimals: 9,
  },
  USDC: {
    symbol: "USDC",
    mint: USDC_MINT,
    decimals: 6,
  },
};

export function getTokenConfig(symbol: WalletTokenSymbol) {
  return WALLET_TOKENS[symbol];
}

export function toAtomicAmount(amount: string, decimals: number): string {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amount must be a positive decimal string.");
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  if (fractionalPart.length > decimals) {
    throw new Error(`Amount supports up to ${decimals} decimal places.`);
  }

  const paddedFraction = fractionalPart.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  return combined || "0";
}

export function fromAtomicAmount(amount: string, decimals: number): string {
  const normalized = amount.replace(/^0+(?=\d)/, "") || "0";
  const padded = normalized.padStart(decimals + 1, "0");
  const wholePart = padded.slice(0, padded.length - decimals) || "0";
  const fractionalPart = padded.slice(-decimals).replace(/0+$/, "");
  return fractionalPart ? `${wholePart}.${fractionalPart}` : wholePart;
}

export function shortenAddress(address: string, visibleChars = 4): string {
  if (address.length <= visibleChars * 2) return address;
  return `${address.slice(0, visibleChars)}...${address.slice(-visibleChars)}`;
}
