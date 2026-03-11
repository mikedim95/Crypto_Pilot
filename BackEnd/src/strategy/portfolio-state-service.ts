import { publicGet } from "../binanceClient.js";
import { getDashboardData } from "../portfolioService.js";
import { allocationFromAssetValues } from "./asset-groups.js";
import { normalizeAllocation, round } from "./allocation-utils.js";
import { PortfolioAccountType, PortfolioState } from "./types.js";

const STABLE_COINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI"]);
const DEFAULT_DEMO_CAPITAL = 10_000;
const DEFAULT_DEMO_ALLOCATION = "BTC:40,ETH:30,BNB:10,USDC:20";

interface BinanceTicker24hResponse {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function parseDemoAllocation(rawValue: string | undefined, baseCurrency: string): Record<string, number> {
  const source = (rawValue ?? DEFAULT_DEMO_ALLOCATION).trim();
  const parsed: Record<string, number> = {};

  source.split(",").forEach((entry) => {
    const [left, right] = entry.split(":");
    const symbol = normalizeSymbol(left ?? "");
    const weight = Number((right ?? "").trim());
    if (!symbol || !Number.isFinite(weight) || weight < 0) return;
    parsed[symbol] = (parsed[symbol] ?? 0) + weight;
  });

  if (Object.keys(parsed).length === 0) {
    return { [baseCurrency]: 100 };
  }

  return normalizeAllocation(parsed);
}

function getPairSymbol(symbol: string): string {
  return `${symbol}USDT`;
}

async function getTickerSnapshot(symbol: string): Promise<{ price: number; change24h: number; volume24h: number }> {
  if (STABLE_COINS.has(symbol)) {
    return { price: 1, change24h: 0, volume24h: 0 };
  }

  const ticker = await publicGet<BinanceTicker24hResponse>("/api/v3/ticker/24hr", { symbol: getPairSymbol(symbol) });

  return {
    price: toNumber(ticker.lastPrice),
    change24h: toNumber(ticker.priceChangePercent),
    volume24h: toNumber(ticker.quoteVolume),
  };
}

export async function getLivePortfolioState(baseCurrency = "USDC"): Promise<PortfolioState> {
  const dashboard = await getDashboardData();

  const assets = dashboard.assets.map((asset) => ({
    symbol: asset.symbol.toUpperCase(),
    quantity: asset.balance,
    price: asset.price,
    value: asset.value,
    allocation: asset.allocation,
    change24h: asset.change24h,
    volume24h: asset.volume24h,
  }));

  const inferredAllocation =
    assets.length > 0
      ? allocationFromAssetValues(assets.map((asset) => ({ symbol: asset.symbol, value: asset.value })))
      : {};

  const allocation =
    assets.length > 0
      ? normalizeAllocation(
          assets.reduce<Record<string, number>>((acc, asset) => {
            acc[asset.symbol] = asset.allocation;
            return acc;
          }, {}),
          Object.keys(inferredAllocation)
        )
      : normalizeAllocation({ [baseCurrency]: 100 });

  return {
    timestamp: dashboard.generatedAt,
    baseCurrency,
    totalValue: dashboard.totalPortfolioValue,
    assets,
    allocation,
  };
}

export async function getDemoPortfolioState(baseCurrency = "USDC", demoCapitalOverride?: number): Promise<PortfolioState> {
  const normalizedBase = normalizeSymbol(baseCurrency || "USDC");
  const fallbackCapital = parsePositiveFloat(process.env.DEMO_ACCOUNT_CAPITAL, DEFAULT_DEMO_CAPITAL);
  const demoCapital =
    typeof demoCapitalOverride === "number" && Number.isFinite(demoCapitalOverride) && demoCapitalOverride > 0
      ? demoCapitalOverride
      : fallbackCapital;
  const targetAllocation = parseDemoAllocation(process.env.DEMO_ACCOUNT_ALLOCATION, normalizedBase);
  const symbols = Object.keys(targetAllocation);
  if (!symbols.includes(normalizedBase)) {
    symbols.push(normalizedBase);
  }

  const tickerEntries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const ticker = await getTickerSnapshot(symbol);
        return [symbol, ticker] as const;
      } catch {
        return [symbol, { price: STABLE_COINS.has(symbol) ? 1 : 0, change24h: 0, volume24h: 0 }] as const;
      }
    })
  );

  const tickers = tickerEntries.reduce<Record<string, { price: number; change24h: number; volume24h: number }>>(
    (acc, [symbol, ticker]) => {
      acc[symbol] = ticker;
      return acc;
    },
    {}
  );

  const assets = symbols.map((symbol) => {
    const ticker = tickers[symbol] ?? { price: 0, change24h: 0, volume24h: 0 };
    const notional = ((targetAllocation[symbol] ?? 0) / 100) * demoCapital;
    const quantity = ticker.price > 0 ? notional / ticker.price : 0;
    const value = quantity * ticker.price;

    return {
      symbol,
      quantity: round(quantity, 10),
      price: round(ticker.price, 8),
      value: round(value, 2),
      allocation: 0,
      change24h: round(ticker.change24h, 4),
      volume24h: round(ticker.volume24h, 2),
    };
  });

  const allocatedValue = assets.reduce((sum, asset) => sum + asset.value, 0);
  const remainder = Math.max(0, round(demoCapital - allocatedValue, 2));
  const baseAsset = assets.find((asset) => asset.symbol === normalizedBase);

  if (remainder > 0) {
    if (baseAsset) {
      baseAsset.value = round(baseAsset.value + remainder, 2);
      baseAsset.quantity = baseAsset.price > 0 ? round(baseAsset.value / baseAsset.price, 10) : round(baseAsset.value, 10);
    } else {
      assets.push({
        symbol: normalizedBase,
        quantity: round(remainder, 10),
        price: 1,
        value: round(remainder, 2),
        allocation: 0,
        change24h: 0,
        volume24h: 0,
      });
    }
  }

  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
  const allocation = normalizeAllocation(
    assets.reduce<Record<string, number>>((acc, asset) => {
      if (totalValue <= 0) {
        acc[asset.symbol] = 0;
      } else {
        acc[asset.symbol] = (asset.value / totalValue) * 100;
      }
      return acc;
    }, {}),
    assets.map((asset) => asset.symbol)
  );

  const assetsWithAllocation = assets
    .map((asset) => ({
      ...asset,
      allocation: allocation[asset.symbol] ?? 0,
    }))
    .sort((left, right) => right.value - left.value);

  return {
    timestamp: new Date().toISOString(),
    baseCurrency: normalizedBase,
    totalValue: round(totalValue, 2),
    assets: assetsWithAllocation,
    allocation,
  };
}

export async function getPortfolioState(
  accountType: PortfolioAccountType,
  baseCurrency = "USDC",
  options?: { demoCapital?: number }
): Promise<PortfolioState> {
  if (accountType === "demo") {
    return getDemoPortfolioState(baseCurrency, options?.demoCapital);
  }

  return getLivePortfolioState(baseCurrency);
}
