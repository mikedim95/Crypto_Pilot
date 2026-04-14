import type { WalletSessionInfo } from "@/types/api";

const WALLET_SESSION_STORAGE_KEY = "mytrader_wallet_session";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getStoredWalletSession(): WalletSessionInfo | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(WALLET_SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WalletSessionInfo>;
    if (!parsed || typeof parsed.token !== "string" || typeof parsed.address !== "string" || typeof parsed.expiresAt !== "string") {
      return null;
    }

    return {
      token: parsed.token,
      address: parsed.address,
      expiresAt: parsed.expiresAt,
      userId: typeof parsed.userId === "number" ? parsed.userId : undefined,
      walletId: typeof parsed.walletId === "number" ? parsed.walletId : undefined,
    };
  } catch {
    return null;
  }
}

export function setStoredWalletSession(session: WalletSessionInfo): void {
  if (!canUseStorage()) return;

  window.localStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredWalletSession(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
}
