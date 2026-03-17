import { TriangleAlert } from "lucide-react";
import type { TradeExecutionResponse, TradePreviewResponse } from "@/types/api";
import { executionRouteLabel, formatAssetAmount, formatUsd } from "./trading-utils";

interface TradingPreviewPanelProps {
  preview: TradePreviewResponse | null;
  executionResult: TradeExecutionResponse | null;
}

export function TradingPreviewPanel(props: TradingPreviewPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4 animate-fade-up" style={{ animationDelay: "180ms" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Transaction Preview</div>
          <div className="mt-1 text-sm text-muted-foreground">Server-validated sizing, free-balance checks, and execution route.</div>
        </div>
        {props.preview ? (
          <div
            className={`inline-flex rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider ${
              props.preview.executable ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
            }`}
          >
            {props.preview.executable ? "Executable" : "Blocked"}
          </div>
        ) : null}
      </div>

      {!props.preview ? (
        <div className="rounded-md border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
          Preview a transaction to see the validated sell amount, buy amount, route, and any execution blockers.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-md border border-border bg-secondary/50 px-3 py-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Selling</div>
              <div className="mt-2 text-sm font-mono text-foreground">
                {formatAssetAmount(props.preview.sellAmount, props.preview.sellingAsset.symbol)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-secondary/50 px-3 py-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Buying</div>
              <div className="mt-2 text-sm font-mono text-foreground">
                {formatAssetAmount(props.preview.buyAmount, props.preview.buyingAsset.symbol)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-secondary/50 px-3 py-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Buy Worth</div>
              <div className="mt-2 text-sm font-mono text-foreground">{formatUsd(props.preview.buyWorthUsdt)}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/50 px-3 py-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Execution Route</div>
              <div className="mt-2 text-sm font-mono text-foreground">
                {executionRouteLabel(props.preview.executionSymbol, props.preview.executionSide)}
              </div>
            </div>
          </div>

          {props.preview.warnings.length > 0 ? (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              {props.preview.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          {props.preview.blockingReasons.length > 0 ? (
            <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-xs text-negative">
              {props.preview.blockingReasons.map((reason) => (
                <div key={reason} className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          ) : null}

          {props.executionResult ? (
            <div className="rounded-md border border-positive/30 bg-positive/10 p-3 text-xs text-positive">
              <div className="font-mono uppercase tracking-wider">Execution Completed</div>
              <div className="mt-2">{props.executionResult.execution.message}</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px]">
                <div>
                  Sold{" "}
                  {formatAssetAmount(
                    props.executionResult.execution.executedSellAmount,
                    props.preview.sellingAsset.symbol
                  )}
                </div>
                <div>
                  Bought{" "}
                  {formatAssetAmount(
                    props.executionResult.execution.executedBuyAmount,
                    props.preview.buyingAsset.symbol
                  )}
                </div>
                <div>Worth {formatUsd(props.executionResult.execution.executedBuyWorthUsdt)}</div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
