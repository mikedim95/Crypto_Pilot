export type WalletTokenSymbol = "SOL" | "USDC";

export interface WalletBalanceRecord {
  symbol: WalletTokenSymbol;
  mint: string;
  decimals: number;
  amount: string;
  atomicAmount: string;
}

export interface WalletSessionClaims {
  sub: string;
  address: string;
  userId: number;
  walletId: number;
  authenticatedAt: string;
  iat?: number;
  exp?: number;
}

export interface WalletQuoteResult {
  fromSymbol: WalletTokenSymbol;
  toSymbol: WalletTokenSymbol;
  amount: string;
  inputAtomicAmount: string;
  expectedOutputAmount: string;
  outputAtomicAmount: string;
  priceImpactPct: string;
  routeLabel: string;
  mode: string;
  requestId?: string;
}

export interface WalletSessionRecord {
  walletId: number;
  userId: number;
  address: string;
  lastAuthenticatedAt: Date | null;
}

export interface StoredWalletNonce {
  id: string;
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuditLogInput {
  action: string;
  status: "success" | "failure";
  userId?: number;
  walletId?: number;
  details?: Record<string, unknown>;
}
