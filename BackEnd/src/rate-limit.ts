import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  keyPrefix: string;
  windowMs: number;
  max: number;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

const rateLimitState = new Map<string, RateLimitState>();

function getRateLimitKey(prefix: string, req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `${prefix}:${ip}`;
}

export function createSimpleRateLimitMiddleware(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getRateLimitKey(options.keyPrefix, req);
    const now = Date.now();
    const current = rateLimitState.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitState.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    if (current.count >= options.max) {
      res.status(429).json({
        message: "Too many requests. Please try again shortly.",
      });
      return;
    }

    current.count += 1;
    next();
  };
}
