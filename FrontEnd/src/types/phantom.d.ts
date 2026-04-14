import type { PhantomSolanaProvider } from "@/lib/phantom";

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomSolanaProvider;
    };
    solana?: PhantomSolanaProvider;
  }
}

export {};
