import type { VersionedTransaction } from "@solana/web3.js";

export interface PhantomPublicKey {
  toBase58(): string;
}

export interface PhantomSignedMessage {
  signature: Uint8Array;
}

export interface PhantomSolanaProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  providers?: PhantomSolanaProvider[];
  publicKey?: PhantomPublicKey;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PhantomPublicKey }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8" | "hex"): Promise<PhantomSignedMessage>;
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
}

interface PhantomWindowLike {
  phantom?: {
    solana?: PhantomSolanaProvider;
  };
  solana?: PhantomSolanaProvider;
  isSecureContext?: boolean;
  location?: {
    hostname?: string;
    origin?: string;
  };
}

export interface PhantomDetectionInfo {
  provider: PhantomSolanaProvider | null;
  requiresSecureContext: boolean;
  isSecureContext: boolean;
  origin: string;
  unavailableReason: string | null;
}

function resolvePhantomProvider(provider: PhantomSolanaProvider | null | undefined): PhantomSolanaProvider | null {
  if (!provider) return null;
  if (provider.isPhantom) return provider;
  if (Array.isArray(provider.providers)) {
    return provider.providers.find((entry) => entry?.isPhantom) ?? null;
  }
  return null;
}

function isLocalhostHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

export function getPhantomProvider(browserWindow?: PhantomWindowLike | null): PhantomSolanaProvider | null {
  const targetWindow = browserWindow ?? (typeof window === "undefined" ? undefined : window);
  if (!targetWindow) return null;

  return resolvePhantomProvider(targetWindow.phantom?.solana) ?? resolvePhantomProvider(targetWindow.solana);
}

export function getPhantomDetectionInfo(browserWindow?: PhantomWindowLike | null): PhantomDetectionInfo {
  const targetWindow = browserWindow ?? (typeof window === "undefined" ? undefined : window);
  const provider = getPhantomProvider(targetWindow);
  const hostname = targetWindow?.location?.hostname?.trim() ?? "";
  const origin = targetWindow?.location?.origin?.trim() ?? "";
  const isSecureContext = Boolean(targetWindow?.isSecureContext);
  const requiresSecureContext = !provider && !isSecureContext && !isLocalhostHost(hostname);

  if (provider) {
    return {
      provider,
      requiresSecureContext: false,
      isSecureContext,
      origin,
      unavailableReason: null,
    };
  }

  return {
    provider: null,
    requiresSecureContext,
    isSecureContext,
    origin,
    unavailableReason: requiresSecureContext
      ? `Phantom only injects on HTTPS or localhost. This tab is running on ${origin || "an insecure origin"}.`
      : "Phantom is not available in this tab yet. Unlock the extension or refresh after enabling it.",
  };
}

export async function waitForPhantomProvider(options?: {
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<PhantomSolanaProvider | null> {
  const timeoutMs = Math.max(0, options?.timeoutMs ?? 2_000);
  const intervalMs = Math.max(50, options?.intervalMs ?? 200);
  const initial = getPhantomDetectionInfo();
  if (initial.provider || initial.requiresSecureContext || typeof window === "undefined") {
    return initial.provider;
  }

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const intervalId = window.setInterval(() => {
      const next = getPhantomDetectionInfo();
      if (next.provider || next.requiresSecureContext || Date.now() >= deadline) {
        window.clearInterval(intervalId);
        resolve(next.provider);
      }
    }, intervalMs);
  });
}

export function shortenAddress(address: string, visibleChars = 4): string {
  if (address.length <= visibleChars * 2) return address;
  return `${address.slice(0, visibleChars)}...${address.slice(-visibleChars)}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

export function base64ToBytes(base64Value: string): Uint8Array {
  const binary = window.atob(base64Value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
