import { ArrowRightLeft } from "lucide-react";
import { SpinnerValue } from "@/components/SpinnerValue";
import { cn } from "@/lib/utils";
import type { TradingAmountMode, TradingAssetAvailability, TradingPairPreview } from "@/types/api";
import { amountModeLabel, formatAssetAmount, formatPairPrice, formatUsd } from "./trading-utils";

interface LocalPreview {
  buyAmount: number;
  sellAmount: number;
  buyWorthUsdt: number;
}

interface TradeComposerPanelProps {
  buyingAssetInput: string;
  sellingAssetInput: string;
  buyingOptions: string[];
  sellingOptions: string[];
  assetAvailabilities: TradingAssetAvailability[];
  normalizedBuyingAsset: string;
  normalizedSellingAsset: string;
  amountMode: TradingAmountMode;
  amountModeButtons: Array<{ id: TradingAmountMode; label: string }>;
  amountInput: string;
  pair: TradingPairPreview | null;
  localPreview: LocalPreview | null;
  loadingPairPreview: boolean;
  invalidPairMessage: string | null;
  pairErrorMessage: string | null;
  tradingAssetsErrorMessage: string | null;
  localBalanceMessage: string | null;
  insufficientFreeBalance: boolean;
  previewDisabled: boolean;
  executeDisabled: boolean;
  previewPending: boolean;
  executePending: boolean;
  onBuyingAssetChange: (value: string) => void;
  onSellingAssetChange: (value: string) => void;
  onSwapAssets: () => void;
  onAmountModeChange: (mode: TradingAmountMode) => void;
  onAmountInputChange: (value: string) => void;
  onPreview: () => void;
  onExecute: () => void;
}

export function TradeComposerPanel(props: TradeComposerPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5 animate-fade-up">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-end">
        <div>
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Buying Asset</label>
          <select
            value={props.buyingAssetInput}
            onChange={(event) => props.onBuyingAssetChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-3 text-sm font-mono uppercase text-foreground outline-none"
          >
            {props.buyingOptions.map((symbol) => {
              const availability = props.assetAvailabilities.find((asset) => asset.symbol === symbol);
              return (
                <option key={symbol} value={symbol}>
                  {availability
                    ? `${symbol}  |  FREE ${availability.freeAmount.toFixed(6)}  |  TOTAL ${availability.totalAmount.toFixed(6)}`
                    : symbol}
                </option>
              );
            })}
          </select>
        </div>

        <button
          type="button"
          onClick={props.onSwapAssets}
          className="h-11 w-11 rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Swap buying and selling assets"
        >
          <ArrowRightLeft className="mx-auto h-4 w-4" />
        </button>

        <div>
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Selling Asset</label>
          <select
            value={props.sellingAssetInput}
            onChange={(event) => props.onSellingAssetChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-3 text-sm font-mono uppercase text-foreground outline-none"
          >
            {props.sellingOptions.map((symbol) => {
              const availability = props.assetAvailabilities.find((asset) => asset.symbol === symbol);
              return (
                <option key={symbol} value={symbol}>
                  {availability
                    ? `${symbol}  |  FREE ${availability.freeAmount.toFixed(6)}  |  RESERVED ${availability.reservedAmount.toFixed(6)}`
                    : symbol}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Amount Mode</label>
        <div className="mt-1 grid grid-cols-1 md:grid-cols-3 gap-2">
          {props.amountModeButtons.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => props.onAmountModeChange(mode.id)}
              className={cn(
                "rounded-md border px-3 py-2.5 text-sm font-mono uppercase tracking-wider transition-colors",
                props.amountMode === mode.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {amountModeLabel(props.amountMode, props.normalizedBuyingAsset, props.normalizedSellingAsset)}
          </label>
          <input
            value={props.amountInput}
            onChange={(event) => props.onAmountInputChange(event.target.value)}
            placeholder="0.00"
            className={cn(
              "mt-1 w-full rounded-md border bg-secondary px-3 py-3 text-sm font-mono text-foreground outline-none transition-colors",
              props.insufficientFreeBalance ? "border-negative text-negative" : "border-border"
            )}
          />
        </div>

        <div>
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Price ({props.normalizedSellingAsset || "sell"} per {props.normalizedBuyingAsset || "buy"})
          </label>
          <div className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-3 text-sm font-mono text-foreground">
            <SpinnerValue
              loading={props.loadingPairPreview && !props.pair}
              value={props.pair ? `${formatPairPrice(props.pair.priceInQuote)} ${props.pair.quoteSymbol}` : undefined}
              placeholder="--"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-secondary/60 px-3 py-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Selling Amount</div>
          <div className="mt-2 text-sm font-mono text-foreground">
            <SpinnerValue
              loading={props.loadingPairPreview && !props.localPreview}
              value={
                props.localPreview && props.normalizedSellingAsset
                  ? formatAssetAmount(props.localPreview.sellAmount, props.normalizedSellingAsset)
                  : undefined
              }
              placeholder="--"
            />
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary/60 px-3 py-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Buying Amount</div>
          <div className="mt-2 text-sm font-mono text-foreground">
            <SpinnerValue
              loading={props.loadingPairPreview && !props.localPreview}
              value={
                props.localPreview && props.normalizedBuyingAsset
                  ? formatAssetAmount(props.localPreview.buyAmount, props.normalizedBuyingAsset)
                  : undefined
              }
              placeholder="--"
            />
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary/60 px-3 py-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Buy Worth (USDT)</div>
          <div className="mt-2 text-sm font-mono text-foreground">
            <SpinnerValue
              loading={props.loadingPairPreview && !props.localPreview}
              value={props.localPreview ? formatUsd(props.localPreview.buyWorthUsdt) : undefined}
              placeholder="--"
            />
          </div>
        </div>
      </div>

      {props.invalidPairMessage ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-xs text-negative">{props.invalidPairMessage}</div>
      ) : null}

      {props.pairErrorMessage ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-xs text-negative">{props.pairErrorMessage}</div>
      ) : null}

      {props.tradingAssetsErrorMessage ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-xs text-negative">{props.tradingAssetsErrorMessage}</div>
      ) : null}

      {props.localBalanceMessage ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-xs font-mono text-negative">
          {props.localBalanceMessage}
        </div>
      ) : null}

      {props.pair && props.pair.executable === false ? (
        <div className="rounded-md border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          Preview is available, but execution is blocked because this pair only has a USD cross price and no direct exchange market route.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={props.previewDisabled}
          onClick={props.onPreview}
          className="w-full rounded-md border border-border bg-secondary px-4 py-3.5 text-sm font-mono font-semibold uppercase tracking-wider text-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.previewPending ? "Previewing..." : "Preview Transaction"}
        </button>

        <button
          type="button"
          disabled={props.executeDisabled}
          onClick={props.onExecute}
          className="w-full rounded-md bg-primary px-4 py-3.5 text-sm font-mono font-semibold uppercase tracking-wider text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.executePending ? "Executing..." : "Execute Transaction"}
        </button>
      </div>
    </div>
  );
}
