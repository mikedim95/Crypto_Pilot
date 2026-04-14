import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { getBotWalletStatus } from "./bot-wallet.js";
import { loadTrackedBalances } from "./balance-utils.js";
import { getTokenConfig, shortenAddress, toAtomicAmount, fromAtomicAmount } from "./constants.js";
import type { WalletRepository } from "./repository.js";
import type {
  WalletSessionClaims,
  WalletQuoteResult,
  WalletSessionRecord,
} from "./types.js";

interface WalletLogger {
  info(bindings: Record<string, unknown>, message?: string): void;
  warn(bindings: Record<string, unknown>, message?: string): void;
  error(bindings: Record<string, unknown>, message?: string): void;
}

interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

interface VerifyWalletInput {
  address: string;
  nonceId: string;
  message: string;
  signatureBase64: string;
}

interface SwapRequestInput {
  fromSymbol: "SOL" | "USDC";
  toSymbol: "SOL" | "USDC";
  amount: string;
}

interface ExecuteSwapInput {
  requestId: string;
  signedTransaction: string;
}

interface JupiterOrderResponse {
  transaction?: string | null;
  requestId?: string;
  outAmount: string;
  router?: string;
  mode?: string;
  priceImpactPct?: string | number;
}

interface JupiterExecuteResponse {
  status: "Success" | "Failed";
  signature?: string;
  code: number;
  inputAmountResult?: string;
  outputAmountResult?: string;
  error?: string;
}

export class WalletServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "WalletServiceError";
  }
}

export class WalletService {
  private readonly nonceTtlMinutes = Number(process.env.AUTH_NONCE_TTL_MINUTES ?? 10);
  private readonly sessionTtlHours = Number(process.env.WALLET_SESSION_TTL_HOURS ?? 12);
  private readonly jupiterApiUrl =
    (process.env.JUPITER_API_URL?.trim() || "https://api.jup.ag/swap/v2").replace(/\/+$/, "");
  private readonly solanaRpcUrl = process.env.SOLANA_RPC_URL?.trim();
  private readonly jwtSecret = process.env.JWT_SECRET?.trim();
  private readonly jupiterApiKey = process.env.JUPITER_API_KEY?.trim();
  private connection: Connection | null = null;

  constructor(
    private readonly repository: WalletRepository,
    private readonly logger: WalletLogger
  ) {}

  async shutdown(): Promise<void> {
    await this.repository.disconnect();
  }

  async createNonce(address: string, metadata: RequestMetadata) {
    this.validatePublicKey(address);

    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.nonceTtlMinutes * 60_000);
    const message = [
      "MyTrader wallet sign-in",
      "",
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
      "",
      "Sign this message to authenticate with MyTrader.",
      "Your Phantom private key stays in the browser and is never sent to the backend.",
    ].join("\n");

    const stored = await this.repository.createAuthNonce({
      walletAddress: address,
      nonce,
      message,
      expiresAt,
    });

    await this.repository.appendAuditLog({
      action: "wallet.auth.nonce",
      status: "success",
      details: {
        address,
        ip: metadata.ip,
      },
    });

    this.logger.info(
      {
        address: shortenAddress(address),
        nonceId: stored.id,
        ip: metadata.ip,
      },
      "Created wallet auth nonce."
    );

    return {
      nonceId: stored.id,
      address,
      message,
      expiresAt: stored.expiresAt.toISOString(),
    };
  }

  async verifyWallet(input: VerifyWalletInput, metadata: RequestMetadata) {
    this.requireJwtSecret();
    this.validatePublicKey(input.address);

    const storedNonce = await this.repository.consumeAuthNonce(input.nonceId, input.address);
    if (!storedNonce || storedNonce.message !== input.message) {
      await this.repository.appendAuditLog({
        action: "wallet.auth.verify",
        status: "failure",
        details: {
          address: input.address,
          nonceId: input.nonceId,
          reason: "nonce_invalid",
          ip: metadata.ip,
        },
      });
      throw new WalletServiceError("Nonce is invalid, expired, or already used.", 401);
    }

    const signature = Buffer.from(input.signatureBase64, "base64");
    const messageBytes = new TextEncoder().encode(input.message);
    const publicKey = new PublicKey(input.address);
    const verified = nacl.sign.detached.verify(messageBytes, signature, publicKey.toBytes());

    if (!verified) {
      await this.repository.appendAuditLog({
        action: "wallet.auth.verify",
        status: "failure",
        details: {
          address: input.address,
          nonceId: input.nonceId,
          reason: "signature_invalid",
          ip: metadata.ip,
        },
      });
      throw new WalletServiceError("Wallet signature verification failed.", 401);
    }

    const wallet = await this.repository.findOrCreateWallet(input.address);
    const authenticatedAt = new Date();
    await this.repository.touchWalletAuthenticated(wallet.walletId, authenticatedAt);

    const expiresAt = new Date(Date.now() + this.sessionTtlHours * 60 * 60_000);
    const claims: WalletSessionClaims = {
      sub: String(wallet.userId),
      address: wallet.address,
      userId: wallet.userId,
      walletId: wallet.walletId,
      authenticatedAt: authenticatedAt.toISOString(),
    };

    const token = jwt.sign(claims, this.jwtSecret!, {
      expiresIn: `${this.sessionTtlHours}h`,
    });

    await this.repository.appendAuditLog({
      action: "wallet.auth.verify",
      status: "success",
      userId: wallet.userId,
      walletId: wallet.walletId,
      details: {
        address: wallet.address,
        ip: metadata.ip,
      },
    });

    this.logger.info(
      {
        address: shortenAddress(wallet.address),
        walletId: wallet.walletId,
        userId: wallet.userId,
      },
      "Wallet authentication verified."
    );

    return {
      session: {
        token,
        address: wallet.address,
        userId: wallet.userId,
        walletId: wallet.walletId,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  verifySessionToken(token: string): WalletSessionClaims {
    this.requireJwtSecret();

    try {
      const decoded = jwt.verify(token, this.jwtSecret!);
      if (!decoded || typeof decoded !== "object") {
        throw new Error("Decoded JWT payload was empty.");
      }

      const address = typeof decoded.address === "string" ? decoded.address : "";
      const userId = typeof decoded.userId === "number" ? decoded.userId : Number(decoded.userId);
      const walletId = typeof decoded.walletId === "number" ? decoded.walletId : Number(decoded.walletId);
      const authenticatedAt = typeof decoded.authenticatedAt === "string" ? decoded.authenticatedAt : "";

      if (!address || !Number.isFinite(userId) || !Number.isFinite(walletId) || !authenticatedAt) {
        throw new Error("Decoded JWT payload was missing wallet fields.");
      }

      return {
        sub: typeof decoded.sub === "string" ? decoded.sub : String(userId),
        address,
        userId,
        walletId,
        authenticatedAt,
        iat: typeof decoded.iat === "number" ? decoded.iat : undefined,
        exp: typeof decoded.exp === "number" ? decoded.exp : undefined,
      };
    } catch (error) {
      throw new WalletServiceError(
        error instanceof Error && /expired/i.test(error.message)
          ? "Wallet session expired."
          : "Invalid wallet session token.",
        401
      );
    }
  }

  async getWalletOverview(session: WalletSessionClaims) {
    const walletRecord = await this.ensureWalletRecord(session);
    const connection = this.requireConnection();
    const balances = await loadTrackedBalances(connection, walletRecord.address);
    const botWallet = await getBotWalletStatus(this.logger, (address) => loadTrackedBalances(connection, address));

    await this.repository.appendAuditLog({
      action: "wallet.read.me",
      status: "success",
      userId: walletRecord.userId,
      walletId: walletRecord.walletId,
      details: {
        address: walletRecord.address,
      },
    });

    return {
      wallet: {
        address: walletRecord.address,
        sessionExpiresAt: session.exp ? new Date(session.exp * 1000).toISOString() : new Date().toISOString(),
        authenticatedAt: session.authenticatedAt,
      },
      balances,
      botWallet,
    };
  }

  async getSwapQuote(session: WalletSessionClaims, input: SwapRequestInput) {
    const walletRecord = await this.ensureWalletRecord(session);
    const quote = await this.fetchJupiterOrder(input);

    await this.repository.appendAuditLog({
      action: "wallet.swap.quote",
      status: "success",
      userId: walletRecord.userId,
      walletId: walletRecord.walletId,
      details: {
        fromSymbol: input.fromSymbol,
        toSymbol: input.toSymbol,
        amount: input.amount,
      },
    });

    return {
      quote,
    };
  }

  async prepareManualSwap(session: WalletSessionClaims, input: SwapRequestInput) {
    const walletRecord = await this.ensureWalletRecord(session);
    const order = await this.fetchJupiterOrder(input, walletRecord.address);

    if (!order.requestId || !order.transaction) {
      throw new WalletServiceError("Jupiter did not return a prepared transaction for this swap.", 502);
    }

    await this.repository.appendAuditLog({
      action: "wallet.swap.prepare",
      status: "success",
      userId: walletRecord.userId,
      walletId: walletRecord.walletId,
      details: {
        fromSymbol: input.fromSymbol,
        toSymbol: input.toSymbol,
        amount: input.amount,
        requestId: order.requestId,
      },
    });

    return {
      action: "prepare" as const,
      requestId: order.requestId,
      transaction: order.transaction,
      quote: this.mapOrderToQuote(input, order),
    };
  }

  async executeManualSwap(session: WalletSessionClaims, input: ExecuteSwapInput) {
    const walletRecord = await this.ensureWalletRecord(session);
    const result = await this.executeJupiterOrder(input);

    await this.repository.appendAuditLog({
      action: "wallet.swap.execute",
      status: result.status === "Success" ? "success" : "failure",
      userId: walletRecord.userId,
      walletId: walletRecord.walletId,
      details: {
        requestId: input.requestId,
        code: result.code,
        signature: result.signature,
      },
    });

    return {
      action: "execute" as const,
      status: result.status,
      code: result.code,
      signature: result.signature,
      explorerUrl: result.signature ? `https://solscan.io/tx/${result.signature}` : undefined,
      inputAmountResult: result.inputAmountResult,
      outputAmountResult: result.outputAmountResult,
      error: result.error,
    };
  }

  private async fetchJupiterOrder(input: SwapRequestInput, taker?: string): Promise<JupiterOrderResponse> {
    this.validateSwapInput(input);

    const fromToken = getTokenConfig(input.fromSymbol);
    const toToken = getTokenConfig(input.toSymbol);
    const amount = toAtomicAmount(input.amount, fromToken.decimals);

    const params = new URLSearchParams({
      inputMint: fromToken.mint,
      outputMint: toToken.mint,
      amount,
    });

    if (taker) {
      params.set("taker", taker);
    }

    const response = await fetch(`${this.jupiterApiUrl}/order?${params.toString()}`, {
      headers: {
        "x-api-key": this.requireJupiterApiKey(),
      },
    });

    const text = await response.text();
    const parsed = this.safeJsonParse(text);

    if (!response.ok) {
      this.logger.warn(
        {
          statusCode: response.status,
          body: typeof parsed === "object" ? parsed : text,
        },
        "Jupiter /order request failed."
      );
      throw new WalletServiceError(`Jupiter quote request failed with status ${response.status}.`, 502);
    }

    const order = parsed as Partial<JupiterOrderResponse>;
    if (!order || typeof order.outAmount !== "string") {
      throw new WalletServiceError("Jupiter returned an invalid order payload.", 502);
    }

    return {
      outAmount: order.outAmount,
      requestId: typeof order.requestId === "string" ? order.requestId : undefined,
      transaction: typeof order.transaction === "string" ? order.transaction : order.transaction ?? undefined,
      router: typeof order.router === "string" ? order.router : undefined,
      mode: typeof order.mode === "string" ? order.mode : undefined,
      priceImpactPct:
        typeof order.priceImpactPct === "string" || typeof order.priceImpactPct === "number"
          ? order.priceImpactPct
          : undefined,
    };
  }

  private async executeJupiterOrder(input: ExecuteSwapInput): Promise<JupiterExecuteResponse> {
    const response = await fetch(`${this.jupiterApiUrl}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.requireJupiterApiKey(),
      },
      body: JSON.stringify({
        signedTransaction: input.signedTransaction,
        requestId: input.requestId,
      }),
    });

    const text = await response.text();
    const parsed = this.safeJsonParse(text);

    if (!response.ok) {
      this.logger.warn(
        {
          statusCode: response.status,
          body: typeof parsed === "object" ? parsed : text,
        },
        "Jupiter /execute request failed."
      );
      throw new WalletServiceError(`Jupiter execution request failed with status ${response.status}.`, 502);
    }

    const result = parsed as Partial<JupiterExecuteResponse>;
    if (!result || (result.status !== "Success" && result.status !== "Failed") || typeof result.code !== "number") {
      throw new WalletServiceError("Jupiter returned an invalid execute payload.", 502);
    }

    return {
      status: result.status,
      code: result.code,
      signature: typeof result.signature === "string" ? result.signature : undefined,
      inputAmountResult: typeof result.inputAmountResult === "string" ? result.inputAmountResult : undefined,
      outputAmountResult: typeof result.outputAmountResult === "string" ? result.outputAmountResult : undefined,
      error: typeof result.error === "string" ? result.error : undefined,
    };
  }

  private mapOrderToQuote(input: SwapRequestInput, order: JupiterOrderResponse): WalletQuoteResult {
    const fromToken = getTokenConfig(input.fromSymbol);
    const toToken = getTokenConfig(input.toSymbol);
    const inputAtomicAmount = toAtomicAmount(input.amount, fromToken.decimals);

    return {
      fromSymbol: input.fromSymbol,
      toSymbol: input.toSymbol,
      amount: input.amount,
      inputAtomicAmount,
      expectedOutputAmount: fromAtomicAmount(order.outAmount, toToken.decimals),
      outputAtomicAmount: order.outAmount,
      priceImpactPct: String(order.priceImpactPct ?? "0"),
      routeLabel: order.router || "jupiter",
      mode: order.mode || "ultra",
      requestId: order.requestId,
    };
  }

  private async ensureWalletRecord(session: WalletSessionClaims): Promise<WalletSessionRecord> {
    const wallet = await this.repository.getWalletByAddress(session.address);
    if (!wallet || wallet.walletId !== session.walletId || wallet.userId !== session.userId) {
      throw new WalletServiceError("Wallet session is no longer valid.", 401);
    }

    return wallet;
  }

  private validatePublicKey(address: string): void {
    try {
      new PublicKey(address);
    } catch {
      throw new WalletServiceError("Wallet address is invalid.", 400);
    }
  }

  private validateSwapInput(input: SwapRequestInput): void {
    if (input.fromSymbol === input.toSymbol) {
      throw new WalletServiceError("Swap tokens must be different.", 400);
    }
    if (!input.amount.trim()) {
      throw new WalletServiceError("Swap amount is required.", 400);
    }
  }

  private requireJwtSecret(): void {
    if (!this.jwtSecret) {
      throw new WalletServiceError("JWT_SECRET is not configured for wallet sessions.", 503);
    }
  }

  private requireConnection(): Connection {
    if (!this.solanaRpcUrl) {
      throw new WalletServiceError("SOLANA_RPC_URL is not configured.", 503);
    }

    if (!this.connection) {
      this.connection = new Connection(this.solanaRpcUrl, "confirmed");
    }

    return this.connection;
  }

  private requireJupiterApiKey(): string {
    if (!this.jupiterApiKey) {
      throw new WalletServiceError("JUPITER_API_KEY is not configured.", 503);
    }
    return this.jupiterApiKey;
  }

  private safeJsonParse(text: string): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
