import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { createSimpleRateLimitMiddleware } from "../rate-limit.js";
import { WalletService, WalletServiceError } from "./wallet-service.js";

const walletAddressSchema = z.string().trim().min(32).max(64);
const walletTokenSchema = z.enum(["SOL", "USDC"]);
const decimalAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Amount must be a positive decimal string.");

const createNonceSchema = z.object({
  address: walletAddressSchema,
});

const verifyWalletSchema = z.object({
  address: walletAddressSchema,
  nonceId: z.string().trim().min(1),
  message: z.string().trim().min(1),
  signatureBase64: z.string().trim().min(1),
});

const quoteSchema = z
  .object({
    fromSymbol: walletTokenSchema,
    toSymbol: walletTokenSchema,
    amount: decimalAmountSchema,
  })
  .refine((value) => value.fromSymbol !== value.toSymbol, {
    message: "Swap tokens must be different.",
    path: ["toSymbol"],
  });

const prepareSwapSchema = z.object({
  action: z.literal("prepare"),
  fromSymbol: walletTokenSchema,
  toSymbol: walletTokenSchema,
  amount: decimalAmountSchema,
});

const executeSwapSchema = z.object({
  action: z.literal("execute"),
  requestId: z.string().trim().min(1),
  signedTransaction: z.string().trim().min(1),
});

const manualSwapSchema = z.discriminatedUnion("action", [prepareSwapSchema, executeSwapSchema]);

interface WalletApiDeps {
  walletService: WalletService;
}

function getRequestMetadata(req: Request) {
  return {
    ip: req.ip || req.socket.remoteAddress || "unknown",
    userAgent: req.header("user-agent") || undefined,
  };
}

function sendServiceError(res: Response, error: unknown): void {
  if (error instanceof WalletServiceError) {
    res.status(error.statusCode).json({
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    message: error instanceof Error ? error.message : "Unexpected wallet server error.",
  });
}

function requireWalletSession(walletService: WalletService, req: Request, res: Response) {
  const authorization = req.header("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({
      message: "Wallet session token is required.",
    });
    return null;
  }

  try {
    return walletService.verifySessionToken(authorization.slice(7).trim());
  } catch (error) {
    sendServiceError(res, error);
    return null;
  }
}

export function createWalletRouter(deps: WalletApiDeps): Router {
  const router = Router();
  const authLimiter = createSimpleRateLimitMiddleware({
    keyPrefix: "wallet-auth",
    windowMs: 60_000,
    max: 10,
  });
  const quoteLimiter = createSimpleRateLimitMiddleware({
    keyPrefix: "wallet-quote",
    windowMs: 60_000,
    max: 20,
  });
  const swapLimiter = createSimpleRateLimitMiddleware({
    keyPrefix: "wallet-swap",
    windowMs: 60_000,
    max: 10,
  });

  router.post("/auth/nonce", authLimiter, async (req, res) => {
    const parsed = createNonceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid wallet nonce request.",
      });
      return;
    }

    try {
      const result = await deps.walletService.createNonce(parsed.data.address, getRequestMetadata(req));
      res.json(result);
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/auth/verify", authLimiter, async (req, res) => {
    const parsed = verifyWalletSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid wallet verification request.",
      });
      return;
    }

    try {
      const result = await deps.walletService.verifyWallet(parsed.data, getRequestMetadata(req));
      res.json(result);
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.get("/wallet/me", async (req, res) => {
    const session = requireWalletSession(deps.walletService, req, res);
    if (!session) return;

    try {
      const result = await deps.walletService.getWalletOverview(session);
      res.json(result);
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/swap/quote", quoteLimiter, async (req, res) => {
    const session = requireWalletSession(deps.walletService, req, res);
    if (!session) return;

    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid swap quote request.",
      });
      return;
    }

    try {
      const result = await deps.walletService.getSwapQuote(session, parsed.data);
      res.json(result);
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  router.post("/swap/manual", swapLimiter, async (req, res) => {
    const session = requireWalletSession(deps.walletService, req, res);
    if (!session) return;

    const parsed = manualSwapSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid manual swap request.",
      });
      return;
    }

    try {
      if (parsed.data.action === "prepare") {
        const result = await deps.walletService.prepareManualSwap(session, parsed.data);
        res.json(result);
        return;
      }

      const result = await deps.walletService.executeManualSwap(session, parsed.data);
      res.json(result);
    } catch (error) {
      sendServiceError(res, error);
    }
  });

  return router;
}
