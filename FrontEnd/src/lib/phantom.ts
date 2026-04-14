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
  publicKey?: PhantomPublicKey;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PhantomPublicKey }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, display?: "utf8" | "hex"): Promise<PhantomSignedMessage>;
  signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
}

export function getPhantomProvider(): PhantomSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana ?? window.solana;
  return provider?.isPhantom ? provider : null;
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
