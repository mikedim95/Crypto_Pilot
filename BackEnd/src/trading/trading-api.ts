import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { resolveStrategyUserScope } from "../strategy/strategy-user-scope.js";
import { TradingService } from "./trading-service.js";

const accountTypeSchema = z.enum(["real", "demo"]);
const amountModeSchema = z.enum(["selling_asset", "buying_asset", "buying_asset_usdt"]);

const tradeRequestSchema = z.object({
  accountType: accountTypeSchema.optional(),
  buyingAsset: z.string().trim().min(2).max(20),
  sellingAsset: z.string().trim().min(2).max(20),
  amountMode: amountModeSchema,
  amount: z.number().finite().positive(),
});

interface TradingApiDeps {
  tradingService: TradingService;
}

function requireUserScope(req: Request, res: Response) {
  const scope = resolveStrategyUserScope(req);
  if (scope) {
    return scope;
  }

  res.status(400).json({
    message: "A signed-in user is required for this action.",
  });
  return null;
}

function parseAccountType(value: unknown): "real" | "demo" {
  const parsed = accountTypeSchema.safeParse(typeof value === "string" ? value.trim().toLowerCase() : "real");
  return parsed.success ? parsed.data : "real";
}

export function createTradingRouter(deps: TradingApiDeps): Router {
  const router = Router();

  router.get("/trading/assets", async (req, res, next) => {
    try {
      const accountType = parseAccountType(req.query.accountType);
      const userScope = resolveStrategyUserScope(req);
      const result = await deps.tradingService.getAssetAvailability(accountType, userScope);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/trading/pair-preview", async (req, res, next) => {
    try {
      const accountType = parseAccountType(req.query.accountType);
      const userScope = resolveStrategyUserScope(req);
      const buyingAsset = typeof req.query.base === "string" ? req.query.base : "";
      const sellingAsset = typeof req.query.quote === "string" ? req.query.quote : "";

      if (!buyingAsset || !sellingAsset) {
        res.status(400).json({ message: "Both buyingAsset and sellingAsset are required." });
        return;
      }

      const result = await deps.tradingService.getPairPreview(buyingAsset, sellingAsset, accountType, userScope);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/trading/preview", async (req, res, next) => {
    try {
      const userScope = requireUserScope(req, res);
      if (!userScope) {
        return;
      }

      const parsedBody = tradeRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({
          message: parsedBody.error.issues[0]?.message ?? "Invalid trading preview request.",
        });
        return;
      }

      const result = await deps.tradingService.previewTrade(
        {
          ...parsedBody.data,
          accountType: parsedBody.data.accountType ?? "real",
        },
        userScope
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/trading/execute", async (req, res, next) => {
    try {
      const userScope = requireUserScope(req, res);
      if (!userScope) {
        return;
      }

      const parsedBody = tradeRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({
          message: parsedBody.error.issues[0]?.message ?? "Invalid trade execution request.",
        });
        return;
      }

      const result = await deps.tradingService.executeTrade(
        {
          ...parsedBody.data,
          accountType: parsedBody.data.accountType ?? "real",
        },
        userScope
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
