import type { AppSession } from "@/types/api";

const SESSION_STORAGE_KEY = "mytrader_session";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getStoredSession(): AppSession | null {
  if (!canUseStorage()) return null;

  const raw =
    window.localStorage.getItem(SESSION_STORAGE_KEY) ??
    window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AppSession>;
    if (!parsed || typeof parsed.username !== "string" || parsed.username.trim().length === 0) {
      return null;
    }

    return {
      userId: typeof parsed.userId === "number" ? parsed.userId : undefined,
      username: parsed.username.trim().toLowerCase(),
      storageMode: parsed.storageMode === "offline" ? "offline" : "database",
      databaseAvailable: parsed.databaseAvailable !== false,
    };
  } catch {
    return null;
  }
}

export function setStoredSession(session: AppSession): void {
  if (!canUseStorage()) return;

  const serialized = JSON.stringify({
    ...session,
    username: session.username.trim().toLowerCase(),
  });

  window.localStorage.setItem(SESSION_STORAGE_KEY, serialized);
  if (typeof window.sessionStorage !== "undefined") {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function clearStoredSession(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  if (typeof window.sessionStorage !== "undefined") {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}
