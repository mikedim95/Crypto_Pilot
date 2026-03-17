import { Lock } from "lucide-react";
import { SpinnerValue } from "@/components/SpinnerValue";
import { cn } from "@/lib/utils";
import type { ConnectionStatus, TradingAssetAvailability, TradingPairPreview } from "@/types/api";
import { executionRouteLabel, formatAssetAmount, formatUsd, pricingSourceLabel } from "./trading-utils";

interface TradingContextPanelProps {
  connection?: ConnectionStatus;
  accountType: "real" | "demo";
  loadingConnection: boolean;
  pair: TradingPairPreview | null;
  loadingPairPreview: boolean;
  buyingAvailability: TradingAssetAvailability | null;
  sellingAvailability: TradingAssetAvailability | null;
  assetAvailabilities: TradingAssetAvailability[];
  assetsPending: boolean;
  dashboardErrorMessage?: string | null;
}

export function TradingContextPanel(props: TradingContextPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-fade-up" style={{ animationDelay: "120ms" }}>
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Trading Context</div>
      <div className="space-y-3 text-sm font-mono">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Connection</span>
          <SpinnerValue
            loading={props.loadingConnection}
            value={
              props.connection
                ? props.connection.connected
                  ? props.connection.testnet
                    ? "Testnet"
                    : "Live"
                  : props.accountType === "demo"
                    ? "Demo"
                    : "Offline"
                : undefined
            }
            className={props.connection?.connected || props.accountType === "demo" ? "text-positive" : "text-muted-foreground"}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Route</span>
          <SpinnerValue
            loading={props.loadingPairPreview && !props.pair}
            value={props.pair ? executionRouteLabel(props.pair.executionSymbol, props.pair.executionSide) : undefined}
            className="text-foreground"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pricing</span>
          <SpinnerValue
            loading={props.loadingPairPreview && !props.pair}
            value={props.pair ? pricingSourceLabel(props.pair.pricingSource) : undefined}
            className="text-foreground"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{props.pair?.baseSymbol ?? "Buy"} 24h</span>
          <SpinnerValue
            loading={props.loadingPairPreview && !props.pair}
            value={props.pair ? `${props.pair.baseChange24h >= 0 ? "+" : ""}${props.pair.baseChange24h}%` : undefined}
            className={cn(props.pair && props.pair.baseChange24h < 0 ? "text-negative" : "text-positive")}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{props.pair?.quoteSymbol ?? "Sell"} 24h</span>
          <SpinnerValue
            loading={props.loadingPairPreview && !props.pair}
            value={props.pair ? `${props.pair.quoteChange24h >= 0 ? "+" : ""}${props.pair.quoteChange24h}%` : undefined}
            className={cn(props.pair && props.pair.quoteChange24h < 0 ? "text-negative" : "text-positive")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {[props.buyingAvailability, props.sellingAvailability]
          .filter((asset): asset is TradingAssetAvailability => Boolean(asset))
          .map((asset, index) => (
            <div key={asset.symbol} className="rounded-md border border-border bg-secondary/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {index === 0 ? "Buying asset" : "Selling asset"}
                </div>
                <div className="text-sm font-mono text-foreground">{asset.symbol}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <div className="text-muted-foreground">Free</div>
                  <div className="mt-1 text-foreground">{formatAssetAmount(asset.freeAmount, asset.symbol)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Reserved</div>
                  <div className="mt-1 text-foreground">{formatAssetAmount(asset.reservedAmount, asset.symbol)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total</div>
                  <div className="mt-1 text-foreground">{formatAssetAmount(asset.totalAmount, asset.symbol)}</div>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div className="rounded-md border border-border bg-secondary/50 p-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Free Assets</div>
        <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
          {props.assetsPending && props.assetAvailabilities.length === 0 ? (
            <div className="text-xs text-muted-foreground">Loading free balances...</div>
          ) : props.assetAvailabilities.length === 0 ? (
            <div className="text-xs text-muted-foreground">No available assets yet.</div>
          ) : (
            props.assetAvailabilities.map((asset) => (
              <div key={asset.symbol} className="rounded-md border border-border/60 bg-background/50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-mono text-foreground">{asset.symbol}</div>
                  <div className="text-xs font-mono text-muted-foreground">{formatUsd(asset.freeValueUsd)}</div>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] font-mono text-muted-foreground">
                  <div>Free {asset.freeAmount.toFixed(6)}</div>
                  <div>Reserved {asset.reservedAmount.toFixed(6)}</div>
                  <div>Total {asset.totalAmount.toFixed(6)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {props.dashboardErrorMessage ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-xs text-negative">
          {props.dashboardErrorMessage}
        </div>
      ) : null}

      <div className="rounded-md border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-1 font-mono uppercase tracking-wider">
          <Lock className="h-3.5 w-3.5" />
          Free Balance Guard
        </div>
        <div className="mt-1">
          Trading uses free balances only. Anything reserved inside enabled rebalance buckets is excluded from the sellable amount.
        </div>
      </div>
    </div>
  );
}
