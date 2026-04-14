import { describe, expect, it } from "vitest";
import { getPhantomDetectionInfo, getPhantomProvider, type PhantomSolanaProvider } from "@/lib/phantom";

function createProvider(overrides?: Partial<PhantomSolanaProvider>): PhantomSolanaProvider {
  return {
    isPhantom: true,
    isConnected: false,
    connect: async () => ({
      publicKey: {
        toBase58: () => "wallet-address",
      },
    }),
    disconnect: async () => undefined,
    signMessage: async () => ({
      signature: new Uint8Array(),
    }),
    signTransaction: async (transaction) => transaction,
    ...overrides,
  };
}

describe("phantom detection", () => {
  it("returns Phantom from a multi-wallet provider list", () => {
    const phantomProvider = createProvider();
    const otherProvider = createProvider({ isPhantom: false });

    const provider = getPhantomProvider({
      isSecureContext: true,
      location: {
        hostname: "localhost",
        origin: "http://localhost:8080",
      },
      solana: {
        ...otherProvider,
        providers: [otherProvider, phantomProvider],
      },
    });

    expect(provider).toBe(phantomProvider);
  });

  it("explains when the page is served from an insecure non-localhost origin", () => {
    const detection = getPhantomDetectionInfo({
      isSecureContext: false,
      location: {
        hostname: "100.81.157.72",
        origin: "http://100.81.157.72:8080",
      },
    });

    expect(detection.provider).toBeNull();
    expect(detection.requiresSecureContext).toBe(true);
    expect(detection.unavailableReason).toContain("HTTPS or localhost");
    expect(detection.unavailableReason).toContain("http://100.81.157.72:8080");
  });

  it("does not require HTTPS for localhost development", () => {
    const detection = getPhantomDetectionInfo({
      isSecureContext: false,
      location: {
        hostname: "localhost",
        origin: "http://localhost:8080",
      },
    });

    expect(detection.requiresSecureContext).toBe(false);
    expect(detection.unavailableReason).toContain("not available in this tab yet");
  });
});
