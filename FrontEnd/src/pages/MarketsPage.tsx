import { useState } from "react";
import { Search } from "lucide-react";
import { Asset } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/hooks/useTradingData";
import { Sparkline } from "@/components/AssetRow";

interface MarketsPageProps {
  onSelectAsset: (asset: Asset) => void;
}

export function MarketsPage({ onSelectAsset }: MarketsPageProps) {
  const { data } = useDashboardData();
  const assets = data?.assets ?? [];
  const [search, setSearch] = useState("");
  const filtered = assets.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const fmtB = (v: number) => {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    return `$${(v / 1e6).toFixed(0)}M`;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 w-96">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none w-full"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Asset", "Price", "24h Change", "Volume", "Market Cap", "Trend"].map((h) => (
                <th key={h} className="py-3 px-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const positive = a.change24h >= 0;
              return (
                <tr
                  key={a.id}
                  onClick={() => onSelectAsset(a)}
                  className={cn(
                    "border-b border-border cursor-pointer transition-colors",
                    positive ? "hover:animate-pulse-positive" : "hover:animate-pulse-negative"
                  )}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
                        <span className="text-xs font-mono font-semibold text-foreground">{a.symbol.slice(0, 2)}</span>
                      </div>
                      <div>
                        <div className="text-sm font-mono font-medium text-foreground">{a.symbol}</div>
                        <div className="text-[11px] text-muted-foreground">{a.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-foreground">{fmt(a.price)}</td>
                  <td className={cn("py-3 px-4 text-right font-mono text-sm", positive ? "text-positive" : "text-negative")}>
                    {positive ? "+" : ""}{a.change24h}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-muted-foreground">{fmtB(a.volume24h)}</td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-muted-foreground">{fmtB(a.marketCap)}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end">
                      <Sparkline data={a.sparkline} positive={positive} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
