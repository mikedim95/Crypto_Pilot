import { getAssetUsdSnapshot, getNameForSymbol, getTradingPairSnapshot } from "../portfolioService.js";
import type { ExchangeId } from "../services/exchanges/types.js";
import { getPortfolioState } from "../strategy/portfolio-state-service.js";
import type { StrategyRepository } from "../strategy/strategy-repository.js";
import type { StrategyUserScope } from "../strategy/strategy-user-scope.js";
import type { DemoAccountHolding, PortfolioAccountType, RebalanceAllocationProfile } from "../strategy/types.js";

export type TradingAmountMode = "selling_asset" | "buying_asset" | "buying_asset_usdt";
export type TradingFiatCurrency = "USD" | "EUR";

export interface TradingAssetAvailability {
  symbol: string;
  name: string;
  totalAmount: number;
  reservedAmount: number;
  freeAmount: number;
  lockedAmount: number;
  priceUsd: number;
  totalValueUsd: number;
  reservedValueUsd: number;
  freeValueUsd: number;
}

export interface TradingPairPreviewResponse {
  accountType: PortfolioAccountType;
  pair: {
    baseSymbol: string;
    baseName: string;
    quoteSymbol: string;
    quoteName: string;
    basePriceUsd: number;
    quotePriceUsd: number;
    priceInQuote: number;
    inversePrice: number;
    baseChange24h: number;
    quoteChange24h: number;
    baseBalance: number;
    quoteBalance: number;
    baseReservedBalance: number;
    quoteReservedBalance: number;
    baseFreeBalance: number;
    quoteFreeBalance: number;
    baseLockedBalance: number;
    quoteLockedBalance: number;
    pricingSource: "direct" | "inverse" | "usd_cross";
    executionSymbol: string | null;
    executionSide: "BUY" | "SELL" | null;
    executable: boolean;
  };
  generatedAt: string;
}

export interface TradingAssetsResponse {
  accountType: PortfolioAccountType;
  assets: TradingAssetAvailability[];
  generatedAt: string;
}

export interface TradePreviewResponse {
  accountType: PortfolioAccountType;
  buyingAsset: TradingAssetAvailability;
  sellingAsset: TradingAssetAvailability;
  amountMode: TradingAmountMode;
  exchange: ExchangeId | null;
  fiatCurrency: TradingFiatCurrency;
  tradedAssetSymbol: string;
  tradedAssetName: string;
  settlementAssetSymbol: string;
  settlementAssetName: string;
  requestedAmount: number;
  buyAmount: number;
  sellAmount: number;
  buyWorthUsdt: number;
  buyWorthFiat: number;
  priceInFiat: number;
  fiatUsdRate: number;
  priceInSellingAsset: number;
  inversePrice: number;
  pricingSource: "direct" | "inverse" | "usd_cross";
  executionSymbol: string | null;
  executionSide: "BUY" | "SELL" | null;
  executable: boolean;
  warnings: string[];
  blockingReasons: string[];
  marketTimestamp: string | null;
  generatedAt: string;
}

export interface TradeExecutionResponse {
  accountType: PortfolioAccountType;
  preview: TradePreviewResponse;
  execution: {
    status: "completed";
    orderId: string | null;
    symbol: string | null;
    side: "BUY" | "SELL" | null;
    executedBuyAmount: number;
    executedSellAmount: number;
    executedBuyWorthUsdt: number;
    message: string;
    executedAt: string;
    raw: unknown;
  };
}

interface TradeRequestInput {
  accountType: PortfolioAccountType;
  buyingAsset: string;
  sellingAsset: string;
  amountMode: TradingAmountMode;
  amount: number;
  exchange?: ExchangeId;
  fiatCurrency?: TradingFiatCurrency;
}

interface AvailabilitySnapshot {
  accountType: PortfolioAccountType;
  assets: TradingAssetAvailability[];
  bySymbol: Map<string, TradingAssetAvailability>;
}

const STABLE_SYMBOLS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "DAI"]);
const USD_LIKE_SYMBOLS = new Set(["USD", ...STABLE_SYMBOLS]);
const TRADING_EXCHANGE_TIMEOUT_MS =
  Number.parseInt(process.env.PUBLIC_MARKET_DATA_TIMEOUT_MS ?? "", 10) > 0
    ? Number.parseInt(process.env.PUBLIC_MARKET_DATA_TIMEOUT_MS ?? "", 10)
    : 5_000;

type VenuePricingSource = "direct" | "inverse";

interface ExchangeTickerSnapshot {
  last: number;
  timestamp: string | null;
}

interface VenuePairSnapshot {
  priceInQuote: number;
  inversePrice: number;
  pricingSource: VenuePricingSource;
  marketTimestamp: string | null;
}

interface FiatTradeContext {
  action: "buy" | "sell";
  tradedAssetSymbol: string;
  settlementAssetSymbol: string;
  fiatCurrency: TradingFiatCurrency;
  settlementAssetFiatRate: number;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundUsd(value: number): number {
  return round(value, 2);
}

function normalizeFiatCurrency(value: unknown): TradingFiatCurrency {
  return typeof value === "string" && value.trim().toUpperCase() === "EUR" ? "EUR" : "USD";
}

function isSettlementSymbolForFiat(symbol: string, fiatCurrency: TradingFiatCurrency): boolean {
  return fiatCurrency === "USD" ? USD_LIKE_SYMBOLS.has(symbol) : symbol === "EUR";
}

async function fetchJson<T>(url: string): Promise<T> {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("User-Agent", "MyTraderBackend");

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TRADING_EXCHANGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Exchange market data request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

function parseFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchKrakenTicker(baseSymbol: string, quoteSymbol: string): Promise<ExchangeTickerSnapshot> {
  const pair = `${baseSymbol}/${quoteSymbol}`;
  const payload = await fetchJson<{
    error?: string[];
    result?: Record<string, { c?: unknown[] }>;
  }>(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`);
  const errors = payload.error ?? [];
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  const entry = payload.result ? Object.values(payload.result)[0] : null;
  const last = parseFiniteNumber(entry?.c?.[0]);
  if (last <= 0) {
    throw new Error(`Kraken did not return a valid last price for ${pair}.`);
  }

  return {
    last,
    timestamp: new Date().toISOString(),
  };
}

async function fetchCryptoComTicker(baseSymbol: string, quoteSymbol: string): Promise<ExchangeTickerSnapshot> {
  const instrumentName = `${baseSymbol}_${quoteSymbol}`;
  const payload = await fetchJson<{
    code?: number;
    message?: string;
    result?: {
      data?: Array<{ i?: string; a?: string; t?: number }>;
    };
  }>(
    `https://api.crypto.com/exchange/v1/public/get-tickers?instrument_name=${encodeURIComponent(instrumentName)}`
  );

  if (payload.code !== 0) {
    throw new Error(payload.message?.trim() || `Crypto.com returned code ${payload.code ?? "unknown"}.`);
  }

  const entry = (payload.result?.data ?? []).find((candidate) => candidate.i === instrumentName) ?? payload.result?.data?.[0];
  const last = parseFiniteNumber(entry?.a);
  if (last <= 0) {
    throw new Error(`Crypto.com did not return a valid last price for ${instrumentName}.`);
  }

  return {
    last,
    timestamp:
      typeof entry?.t === "number" && Number.isFinite(entry.t) && entry.t > 0
        ? new Date(entry.t).toISOString()
        : new Date().toISOString(),
  };
}

async function fetchCoinbaseTicker(baseSymbol: string, quoteSymbol: string): Promise<ExchangeTickerSnapshot> {
  const productId = `${baseSymbol}-${quoteSymbol}`;
  const payload = await fetchJson<{ price?: string; time?: string }>(
    `https://api.exchange.coinbase.com/products/${productId}/ticker`
  );
  const last = parseFiniteNumber(payload.price);
  if (last <= 0) {
    throw new Error(`Coinbase did not return a valid last price for ${productId}.`);
  }

  return {
    last,
    timestamp: typeof payload.time === "string" ? payload.time : new Date().toISOString(),
  };
}

async function fetchExchangeTicker(
  exchange: ExchangeId,
  baseSymbol: string,
  quoteSymbol: string
): Promise<ExchangeTickerSnapshot> {
  if (exchange === "kraken") {
    return fetchKrakenTicker(baseSymbol, quoteSymbol);
  }
  if (exchange === "crypto.com") {
    return fetchCryptoComTicker(baseSymbol, quoteSymbol);
  }
  return fetchCoinbaseTicker(baseSymbol, quoteSymbol);
}

async function getExchangePairSnapshot(
  exchange: ExchangeId,
  baseSymbol: string,
  quoteSymbol: string
): Promise<VenuePairSnapshot> {
  try {
    const direct = await fetchExchangeTicker(exchange, baseSymbol, quoteSymbol);
    return {
      priceInQuote: round(direct.last, 8),
      inversePrice: round(1 / direct.last, 8),
      pricingSource: "direct",
      marketTimestamp: direct.timestamp,
    };
  } catch {
    const inverse = await fetchExchangeTicker(exchange, quoteSymbol, baseSymbol);
    return {
      priceInQuote: round(1 / inverse.last, 8),
      inversePrice: round(inverse.last, 8),
      pricingSource: "inverse",
      marketTimestamp: inverse.timestamp,
    };
  }
}

function inferFiatTradeContext(
  buyingAsset: string,
  sellingAsset: string,
  fiatCurrency?: TradingFiatCurrency
): FiatTradeContext | null {
  const resolvedFiat = normalizeFiatCurrency(
    fiatCurrency ?? (buyingAsset === "EUR" || sellingAsset === "EUR" ? "EUR" : "USD")
  );

  if (isSettlementSymbolForFiat(sellingAsset, resolvedFiat) && !isSettlementSymbolForFiat(buyingAsset, resolvedFiat)) {
    return {
      action: "buy",
      tradedAssetSymbol: buyingAsset,
      settlementAssetSymbol: sellingAsset,
      fiatCurrency: resolvedFiat,
      settlementAssetFiatRate: 1,
    };
  }

  if (isSettlementSymbolForFiat(buyingAsset, resolvedFiat) && !isSettlementSymbolForFiat(sellingAsset, resolvedFiat)) {
    return {
      action: "sell",
      tradedAssetSymbol: sellingAsset,
      settlementAssetSymbol: buyingAsset,
      fiatCurrency: resolvedFiat,
      settlementAssetFiatRate: 1,
    };
  }

  return null;
}

function buildTradeExecutionRoute(
  tradedAssetSymbol: string,
  fiatCurrency: TradingFiatCurrency,
  action: "buy" | "sell"
): { symbol: string; side: "BUY" | "SELL" } {
  return {
    symbol: `${tradedAssetSymbol}${fiatCurrency}`,
    side: action === "buy" ? "BUY" : "SELL",
  };
}

function buildExecutionRoute(
  buyingAsset: string,
  sellingAsset: string,
  pricingSource: "direct" | "inverse" | "usd_cross"
): { symbol: string | null; side: "BUY" | "SELL" | null } {
  if (pricingSource === "direct") {
    return {
      symbol: `${buyingAsset}${sellingAsset}`,
      side: "BUY",
    };
  }

  if (pricingSource === "inverse") {
    return {
      symbol: `${sellingAsset}${buyingAsset}`,
      side: "SELL",
    };
  }

  return {
    symbol: null,
    side: null,
  };
}

function collectReservedHoldings(
  profiles: RebalanceAllocationProfile[]
): Map<string, number> {
  const reserved = new Map<string, number>();

  profiles
    .filter((profile) => profile.isEnabled)
    .forEach((profile) => {
      profile.holdings.forEach((holding) => {
        const symbol = normalizeSymbol(holding.symbol);
        reserved.set(symbol, (reserved.get(symbol) ?? 0) + Math.max(0, holding.quantity));
      });
    });

  return reserved;
}

function buildEmptyAvailability(symbol: string, priceUsd = 0): TradingAssetAvailability {
  return {
    symbol,
    name: getNameForSymbol(symbol),
    totalAmount: 0,
    reservedAmount: 0,
    freeAmount: 0,
    lockedAmount: 0,
    priceUsd: round(priceUsd, 8),
    totalValueUsd: 0,
    reservedValueUsd: 0,
    freeValueUsd: 0,
  };
}

async function priceForSymbol(symbol: string): Promise<number> {
  if (STABLE_SYMBOLS.has(symbol)) {
    return 1;
  }

  try {
    const snapshot = await getAssetUsdSnapshot(symbol);
    return round(snapshot.price, 8);
  } catch {
    return 0;
  }
}

export class TradingService {
  constructor(private readonly repository: StrategyRepository) {}

  private async getAvailabilitySnapshot(
    accountType: PortfolioAccountType,
    userScope?: StrategyUserScope
  ): Promise<AvailabilitySnapshot> {
    if (accountType === "demo") {
      const [demoAccount, profiles] = await Promise.all([
        this.repository.getDemoAccountSettings(userScope),
        this.repository.listRebalanceAllocationProfiles(userScope),
      ]);
      const portfolio = await getPortfolioState("demo", "USDC", { demoAccount, userScope, botProfiles: profiles });
      const reservedBySymbol = collectReservedHoldings(profiles);
      const assetSymbols = new Set<string>([
        ...portfolio.assets.map((asset) => normalizeSymbol(asset.symbol)),
        ...reservedBySymbol.keys(),
      ]);

      const assets = Array.from(assetSymbols).map((symbol) => {
        const portfolioAsset = portfolio.assets.find((asset) => normalizeSymbol(asset.symbol) === symbol);
        const priceUsd = portfolioAsset?.price ?? 0;
        const totalAmount = portfolioAsset?.quantity ?? 0;
        const reservedAmount = reservedBySymbol.get(symbol) ?? 0;
        const freeAmount = Math.max(0, totalAmount - reservedAmount);

        return {
          symbol,
          name: getNameForSymbol(symbol),
          totalAmount: round(totalAmount, 10),
          reservedAmount: round(reservedAmount, 10),
          freeAmount: round(freeAmount, 10),
          lockedAmount: 0,
          priceUsd: round(priceUsd, 8),
          totalValueUsd: roundUsd(totalAmount * priceUsd),
          reservedValueUsd: roundUsd(reservedAmount * priceUsd),
          freeValueUsd: roundUsd(freeAmount * priceUsd),
        };
      });

      assets.sort((left, right) => right.freeValueUsd - left.freeValueUsd || left.symbol.localeCompare(right.symbol));

      return {
        accountType,
        assets,
        bySymbol: new Map(assets.map((asset) => [asset.symbol, asset])),
      };
    }

    return {
      accountType,
      assets: [],
      bySymbol: new Map(),
    };
  }

  async getAssetAvailability(
    accountType: PortfolioAccountType,
    userScope?: StrategyUserScope
  ): Promise<TradingAssetsResponse> {
    const snapshot = await this.getAvailabilitySnapshot(accountType, userScope);
    return {
      accountType,
      assets: snapshot.assets,
      generatedAt: new Date().toISOString(),
    };
  }

  async getPairPreview(
    baseSymbol: string,
    quoteSymbol: string,
    accountType: PortfolioAccountType,
    userScope?: StrategyUserScope
  ): Promise<TradingPairPreviewResponse> {
    const normalizedBase = normalizeSymbol(baseSymbol);
    const normalizedQuote = normalizeSymbol(quoteSymbol);
    const snapshot = await this.getAvailabilitySnapshot(accountType, userScope);
    const pairSnapshot = await getTradingPairSnapshot(normalizedBase, normalizedQuote);
    const executionRoute = buildExecutionRoute(normalizedBase, normalizedQuote, pairSnapshot.pricingSource);
    const baseAvailability = snapshot.bySymbol.get(normalizedBase) ?? buildEmptyAvailability(normalizedBase, pairSnapshot.base.price);
    const quoteAvailability = snapshot.bySymbol.get(normalizedQuote) ?? buildEmptyAvailability(normalizedQuote, pairSnapshot.quote.price);

    return {
      accountType,
      pair: {
        baseSymbol: normalizedBase,
        baseName: getNameForSymbol(normalizedBase),
        quoteSymbol: normalizedQuote,
        quoteName: getNameForSymbol(normalizedQuote),
        basePriceUsd: round(pairSnapshot.base.price, 8),
        quotePriceUsd: round(pairSnapshot.quote.price, 8),
        priceInQuote: round(pairSnapshot.priceInQuote, 8),
        inversePrice: round(pairSnapshot.inversePrice, 8),
        baseChange24h: round(pairSnapshot.base.change24h, 4),
        quoteChange24h: round(pairSnapshot.quote.change24h, 4),
        baseBalance: round(baseAvailability.totalAmount, 10),
        quoteBalance: round(quoteAvailability.totalAmount, 10),
        baseReservedBalance: round(baseAvailability.reservedAmount, 10),
        quoteReservedBalance: round(quoteAvailability.reservedAmount, 10),
        baseFreeBalance: round(baseAvailability.freeAmount, 10),
        quoteFreeBalance: round(quoteAvailability.freeAmount, 10),
        baseLockedBalance: round(baseAvailability.lockedAmount, 10),
        quoteLockedBalance: round(quoteAvailability.lockedAmount, 10),
        pricingSource: pairSnapshot.pricingSource,
        executionSymbol: executionRoute.symbol,
        executionSide: executionRoute.side,
        executable: pairSnapshot.pricingSource !== "usd_cross",
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async buildTradePreview(
    input: TradeRequestInput,
    userScope?: StrategyUserScope
  ): Promise<TradePreviewResponse> {
    const buyingAsset = normalizeSymbol(input.buyingAsset);
    const sellingAsset = normalizeSymbol(input.sellingAsset);

    if (!buyingAsset || !sellingAsset) {
      throw new Error("Buying asset and selling asset are required.");
    }

    if (buyingAsset === sellingAsset) {
      throw new Error("Buying asset and selling asset must be different.");
    }

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    const snapshot = await this.getAvailabilitySnapshot(input.accountType, userScope);
    const buyingAvailability = snapshot.bySymbol.get(buyingAsset) ?? buildEmptyAvailability(buyingAsset);
    const sellingAvailability = snapshot.bySymbol.get(sellingAsset) ?? buildEmptyAvailability(sellingAsset);
    const warnings: string[] = [];
    const blockingReasons: string[] = [];
    const fiatContext = inferFiatTradeContext(buyingAsset, sellingAsset, input.fiatCurrency);

    if (fiatContext) {
      const [tradedAssetUsdSnapshot, settlementAssetUsdSnapshot, fiatUsdSnapshot] = await Promise.all([
        getAssetUsdSnapshot(fiatContext.tradedAssetSymbol),
        getAssetUsdSnapshot(fiatContext.settlementAssetSymbol),
        getAssetUsdSnapshot(fiatContext.fiatCurrency),
      ]);

      let priceInFiat = 0;
      let pricingSource: "direct" | "inverse" | "usd_cross" = "usd_cross";
      let marketTimestamp: string | null = null;

      try {
        if (input.exchange) {
          const exchangePair = await getExchangePairSnapshot(
            input.exchange,
            fiatContext.tradedAssetSymbol,
            fiatContext.fiatCurrency
          );
          priceInFiat = exchangePair.priceInQuote;
          pricingSource = exchangePair.pricingSource;
          marketTimestamp = exchangePair.marketTimestamp;
        } else {
          const pairSnapshot = await getTradingPairSnapshot(fiatContext.tradedAssetSymbol, fiatContext.fiatCurrency);
          priceInFiat = pairSnapshot.priceInQuote;
          pricingSource = pairSnapshot.pricingSource;
        }
      } catch (error) {
        blockingReasons.push(
          input.exchange
            ? `Selected exchange ${input.exchange} does not provide a ${fiatContext.tradedAssetSymbol}/${fiatContext.fiatCurrency} market.`
            : `Unable to price ${fiatContext.tradedAssetSymbol}/${fiatContext.fiatCurrency}.`
        );
        warnings.push(error instanceof Error ? error.message : "Exchange pricing is unavailable.");
      }

      if (!input.exchange && pricingSource === "usd_cross") {
        blockingReasons.push("This asset pair only has a USD cross price. Direct execution requires a direct or reverse exchange market.");
      }

      const priceInSettlementAsset =
        priceInFiat > 0 && fiatContext.settlementAssetFiatRate > 0
          ? round(priceInFiat / fiatContext.settlementAssetFiatRate, 8)
          : 0;

      let buyAmount = 0;
      let sellAmount = 0;

      if (fiatContext.action === "buy") {
        if (input.amountMode === "selling_asset") {
          sellAmount = input.amount;
          buyAmount = priceInSettlementAsset > 0 ? sellAmount / priceInSettlementAsset : 0;
        } else if (input.amountMode === "buying_asset") {
          buyAmount = input.amount;
          sellAmount = buyAmount * priceInSettlementAsset;
        } else {
          const requestedUsd = input.amount;
          buyAmount = tradedAssetUsdSnapshot.price > 0 ? requestedUsd / tradedAssetUsdSnapshot.price : 0;
          sellAmount = buyAmount * priceInSettlementAsset;
        }
      } else {
        if (input.amountMode === "selling_asset") {
          sellAmount = input.amount;
          buyAmount = sellAmount * priceInSettlementAsset;
        } else if (input.amountMode === "buying_asset") {
          buyAmount = input.amount;
          sellAmount = priceInSettlementAsset > 0 ? buyAmount / priceInSettlementAsset : 0;
        } else {
          const requestedUsd = input.amount;
          buyAmount = settlementAssetUsdSnapshot.price > 0 ? requestedUsd / settlementAssetUsdSnapshot.price : 0;
          sellAmount = priceInSettlementAsset > 0 ? buyAmount / priceInSettlementAsset : 0;
        }
      }

      const resolvedBuyingPriceUsd = buyingAvailability.priceUsd || (buyingAsset === fiatContext.tradedAssetSymbol ? tradedAssetUsdSnapshot.price : settlementAssetUsdSnapshot.price);
      const resolvedSellingPriceUsd = sellingAvailability.priceUsd || (sellingAsset === fiatContext.tradedAssetSymbol ? tradedAssetUsdSnapshot.price : settlementAssetUsdSnapshot.price);
      const buyWorthUsdt = buyAmount * resolvedBuyingPriceUsd;
      const buyWorthFiat =
        fiatContext.action === "buy"
          ? buyAmount * priceInFiat
          : buyAmount * fiatContext.settlementAssetFiatRate;
      const priceInSellingAsset =
        fiatContext.action === "buy"
          ? priceInSettlementAsset
          : priceInFiat > 0
            ? round(fiatContext.settlementAssetFiatRate / priceInFiat, 8)
            : 0;
      const inversePrice = priceInSellingAsset > 0 ? round(1 / priceInSellingAsset, 8) : 0;
      const executionRoute =
        priceInFiat > 0
          ? buildTradeExecutionRoute(fiatContext.tradedAssetSymbol, fiatContext.fiatCurrency, fiatContext.action)
          : null;

      if (sellAmount - sellingAvailability.freeAmount > 0.00000001) {
        blockingReasons.push(
          `${sellingAsset} free balance is ${round(sellingAvailability.freeAmount, 8)} but the trade needs ${round(sellAmount, 8)}.`
        );
      }

      if (sellAmount <= 0 || buyAmount <= 0 || buyWorthUsdt <= 0) {
        blockingReasons.push("The requested trade amount is too small to preview.");
      }

      if (input.accountType === "real") {
        blockingReasons.push("Live exchange execution is unavailable.");
      }

      if (input.accountType === "demo" && sellingAvailability.freeAmount <= 0) {
        warnings.push(`${sellingAsset} has no free balance available outside active bots.`);
      }

      return {
        accountType: input.accountType,
        buyingAsset: {
          ...buyingAvailability,
          priceUsd: round(resolvedBuyingPriceUsd, 8),
        },
        sellingAsset: {
          ...sellingAvailability,
          priceUsd: round(resolvedSellingPriceUsd, 8),
        },
        amountMode: input.amountMode,
        exchange: input.exchange ?? null,
        fiatCurrency: fiatContext.fiatCurrency,
        tradedAssetSymbol: fiatContext.tradedAssetSymbol,
        tradedAssetName: getNameForSymbol(fiatContext.tradedAssetSymbol),
        settlementAssetSymbol: fiatContext.settlementAssetSymbol,
        settlementAssetName: getNameForSymbol(fiatContext.settlementAssetSymbol),
        requestedAmount: round(input.amount, 8),
        buyAmount: round(buyAmount, 8),
        sellAmount: round(sellAmount, 8),
        buyWorthUsdt: roundUsd(buyWorthUsdt),
        buyWorthFiat: roundUsd(buyWorthFiat),
        priceInFiat: round(priceInFiat, 8),
        fiatUsdRate: round(fiatUsdSnapshot.price, 8),
        priceInSellingAsset: round(priceInSellingAsset, 8),
        inversePrice: round(inversePrice, 8),
        pricingSource,
        executionSymbol: executionRoute?.symbol ?? null,
        executionSide: executionRoute?.side ?? null,
        executable: blockingReasons.length === 0,
        warnings,
        blockingReasons,
        marketTimestamp,
        generatedAt: new Date().toISOString(),
      };
    }

    const pairSnapshot = await getTradingPairSnapshot(buyingAsset, sellingAsset);
    const route = buildExecutionRoute(buyingAsset, sellingAsset, pairSnapshot.pricingSource);

    let buyAmount = 0;
    let sellAmount = 0;
    let buyWorthUsdt = 0;

    if (input.amountMode === "selling_asset") {
      sellAmount = input.amount;
      buyAmount = pairSnapshot.priceInQuote > 0 ? sellAmount / pairSnapshot.priceInQuote : 0;
      buyWorthUsdt = buyAmount * pairSnapshot.base.price;
    } else if (input.amountMode === "buying_asset") {
      buyAmount = input.amount;
      sellAmount = buyAmount * pairSnapshot.priceInQuote;
      buyWorthUsdt = buyAmount * pairSnapshot.base.price;
    } else {
      buyWorthUsdt = input.amount;
      buyAmount = pairSnapshot.base.price > 0 ? buyWorthUsdt / pairSnapshot.base.price : 0;
      sellAmount = buyAmount * pairSnapshot.priceInQuote;
    }

    if (pairSnapshot.pricingSource === "usd_cross") {
      blockingReasons.push("This asset pair only has a USD cross price. Direct execution requires a direct or reverse exchange market.");
    }

    if (sellAmount - sellingAvailability.freeAmount > 0.00000001) {
      blockingReasons.push(
        `${sellingAsset} free balance is ${round(sellingAvailability.freeAmount, 8)} but the trade needs ${round(sellAmount, 8)}.`
      );
    }

    if (sellAmount <= 0 || buyAmount <= 0 || buyWorthUsdt <= 0) {
      blockingReasons.push("The requested trade amount is too small to preview.");
    }

    if (input.accountType === "real") {
      blockingReasons.push("Live exchange execution is unavailable.");
    }

    if (input.accountType === "demo" && sellingAvailability.freeAmount <= 0) {
      warnings.push(`${sellingAsset} has no free balance available outside active bots.`);
    }

    return {
      accountType: input.accountType,
      buyingAsset: {
        ...buyingAvailability,
        priceUsd: buyingAvailability.priceUsd > 0 ? buyingAvailability.priceUsd : round(pairSnapshot.base.price, 8),
      },
      sellingAsset: {
        ...sellingAvailability,
        priceUsd: sellingAvailability.priceUsd > 0 ? sellingAvailability.priceUsd : round(pairSnapshot.quote.price, 8),
      },
      amountMode: input.amountMode,
      exchange: input.exchange ?? null,
      fiatCurrency: normalizeFiatCurrency(input.fiatCurrency),
      tradedAssetSymbol: buyingAsset,
      tradedAssetName: getNameForSymbol(buyingAsset),
      settlementAssetSymbol: sellingAsset,
      settlementAssetName: getNameForSymbol(sellingAsset),
      requestedAmount: round(input.amount, 8),
      buyAmount: round(buyAmount, 8),
      sellAmount: round(sellAmount, 8),
      buyWorthUsdt: roundUsd(buyWorthUsdt),
      buyWorthFiat: roundUsd(buyWorthUsdt),
      priceInFiat: round(pairSnapshot.base.price, 8),
      fiatUsdRate: 1,
      priceInSellingAsset: round(pairSnapshot.priceInQuote, 8),
      inversePrice: round(pairSnapshot.inversePrice, 8),
      pricingSource: pairSnapshot.pricingSource,
      executionSymbol: route.symbol,
      executionSide: route.side,
      executable: blockingReasons.length === 0,
      warnings,
      blockingReasons,
      marketTimestamp: null,
      generatedAt: new Date().toISOString(),
    };
  }

  async previewTrade(input: TradeRequestInput, userScope?: StrategyUserScope): Promise<TradePreviewResponse> {
    return this.buildTradePreview(input, userScope);
  }

  private async rebuildDemoHoldings(holdings: DemoAccountHolding[]): Promise<DemoAccountHolding[]> {
    const cleaned = holdings
      .map((holding) => ({
        symbol: normalizeSymbol(holding.symbol),
        quantity: round(Math.max(0, holding.quantity), 10),
      }))
      .filter((holding) => holding.quantity > 0);

    if (cleaned.length === 0) {
      return [];
    }

    const priced = await Promise.all(
      cleaned.map(async (holding) => {
        const price = await priceForSymbol(holding.symbol);
        return {
          ...holding,
          price,
          value: holding.quantity * price,
        };
      })
    );

    const totalValue = priced.reduce((sum, holding) => sum + holding.value, 0);

    return priced
      .map((holding) => ({
        symbol: holding.symbol,
        quantity: round(holding.quantity, 10),
        targetAllocation: totalValue > 0 ? round((holding.value / totalValue) * 100, 4) : 0,
      }))
      .filter((holding) => holding.quantity > 0);
  }

  async executeTrade(input: TradeRequestInput, userScope?: StrategyUserScope): Promise<TradeExecutionResponse> {
    const preview = await this.buildTradePreview(input, userScope);

    if (!preview.executable || preview.blockingReasons.length > 0) {
      throw new Error(preview.blockingReasons[0] ?? "This trade cannot be executed.");
    }

    if (input.accountType === "demo") {
      const demoAccount = await this.repository.getDemoAccountSettings(userScope);
      const quantities = new Map(
        demoAccount.holdings.map((holding) => [normalizeSymbol(holding.symbol), Math.max(0, holding.quantity)])
      );

      const nextSellingQuantity = (quantities.get(preview.sellingAsset.symbol) ?? 0) - preview.sellAmount;
      if (nextSellingQuantity < -0.00000001) {
        throw new Error(`Executing this trade would create a negative ${preview.sellingAsset.symbol} balance.`);
      }

      quantities.set(
        preview.sellingAsset.symbol,
        round(Math.max(0, nextSellingQuantity), 10)
      );
      quantities.set(
        preview.buyingAsset.symbol,
        round((quantities.get(preview.buyingAsset.symbol) ?? 0) + preview.buyAmount, 10)
      );

      const nextHoldings = await this.rebuildDemoHoldings(
        Array.from(quantities.entries()).map(([symbol, quantity]) => ({
          symbol,
          quantity,
          targetAllocation: 0,
        }))
      );

      await this.repository.setDemoAccountHoldings(nextHoldings, userScope);

      return {
        accountType: "demo",
        preview,
        execution: {
          status: "completed",
          orderId: null,
          symbol: preview.executionSymbol,
          side: preview.executionSide,
          executedBuyAmount: preview.buyAmount,
          executedSellAmount: preview.sellAmount,
          executedBuyWorthUsdt: preview.buyWorthUsdt,
          message: `Demo conversion executed from ${preview.sellingAsset.symbol} into ${preview.buyingAsset.symbol}.`,
          executedAt: new Date().toISOString(),
          raw: {
            mode: "demo",
            exchange: preview.exchange,
            fiatCurrency: preview.fiatCurrency,
            marketTimestamp: preview.marketTimestamp,
          },
        },
      };
    }

    throw new Error("Live exchange execution is unavailable.");
  }
}
