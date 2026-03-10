import { useState } from "react";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import { Asset } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Sparkline } from "./AssetRow";

interface ContextPanelProps {
  asset: Asset | null;
  onClose: () => void;
}

export function ContextPanel({ asset, onClose }: ContextPanelProps) {
  const [tab, setTab] = useState<"info" | "trade">("info");

  if (!asset) return null;

  const positive = asset.change24h >= 0;
  const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const fmtB = (v: number) => {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return fmt(v);
  };

  return (
    <div className="fixed top-0 right-0 h-screen w-80 bg-card border-l border-border z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
            <span className="text-xs font-mono font-semibold text-foreground">{asset.symbol.slice(0, 2)}</span>
          </div>
          <div>
            <div className="text-sm font-mono font-semibold text-foreground">{asset.symbol}</div>
            <div className="text-[11px] text-muted-foreground">{asset.name}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["info", "trade"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-3 text-xs font-mono uppercase tracking-wider transition-colors",
              tab === t ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {tab === "info" ? (
          <>
            {/* Price */}
            <div>
              <div className="text-2xl font-mono font-bold text-foreground">{fmt(asset.price)}</div>
              <div className={cn("flex items-center gap-1 text-sm font-mono mt-1", positive ? "text-positive" : "text-negative")}>
                {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {positive ? "+" : ""}{asset.change24h}%
              </div>
            </div>

            {/* Chart placeholder */}
            <div className="bg-secondary/50 rounded-lg p-4 h-40 flex items-center justify-center">
              <Sparkline data={asset.sparkline} positive={positive} width={240} height={120} />
            </div>

            {/* Stats */}
            <div className="space-y-3">
              {[
                ["Market Cap", fmtB(asset.marketCap)],
                ["24h Volume", fmtB(asset.volume24h)],
                ["Your Balance", `${asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset.symbol}`],
                ["Your Value", fmt(asset.value)],
                ["Allocation", `${asset.allocation}%`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-mono text-foreground">{val}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Trade form placeholder */}
            <div className="flex gap-2">
              <button className="flex-1 py-2.5 rounded-md bg-positive/10 text-positive text-xs font-mono font-semibold">Buy</button>
              <button className="flex-1 py-2.5 rounded-md bg-negative/10 text-negative text-xs font-mono font-semibold">Sell</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Amount ({asset.symbol})</label>
                <input className="mt-1 w-full bg-secondary rounded-md px-3 py-2.5 font-mono text-sm text-foreground outline-none border border-border focus:border-primary transition-colors" placeholder="0.00" />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Price (USD)</label>
                <input className="mt-1 w-full bg-secondary rounded-md px-3 py-2.5 font-mono text-sm text-foreground outline-none border border-border focus:border-primary transition-colors" value={asset.price.toString()} readOnly />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Total (USD)</label>
                <input className="mt-1 w-full bg-secondary rounded-md px-3 py-2.5 font-mono text-sm text-muted-foreground outline-none border border-border" placeholder="$0.00" readOnly />
              </div>
            </div>
            <button className="w-full py-3 rounded-md bg-primary text-primary-foreground text-xs font-mono font-semibold uppercase tracking-wider">
              Place Order
            </button>
            <p className="text-[10px] text-muted-foreground text-center">This is a UI preview. No real orders will be placed.</p>
          </>
        )}
      </div>
    </div>
  );
}
