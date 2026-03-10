import { MetricCard } from "@/components/MetricCard";
import { AssetRow } from "@/components/AssetRow";
import { Asset } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/hooks/useTradingData";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DashboardPageProps {
  onSelectAsset: (asset: Asset) => void;
}

export function DashboardPage({ onSelectAsset }: DashboardPageProps) {
  const { data } = useDashboardData();
  const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="p-6 space-y-4">
      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Portfolio Value"
          value={fmt(data.totalPortfolioValue)}
          change={data.portfolioChange24h}
        />
        <MetricCard
          title="24h Change"
          value={`${data.portfolioChange24hValue >= 0 ? "+" : ""}${fmt(data.portfolioChange24hValue)}`}
          subtitle={`${data.portfolioChange24h >= 0 ? "+" : ""}${data.portfolioChange24h}%`}
        />
        <MetricCard title="Assets" value={data.assets.length.toString()} subtitle="Active holdings" />
        <MetricCard
          title="Best Performer"
          value={data.marketMovers[0]?.symbol ?? "--"}
          change={data.marketMovers[0]?.change ?? 0}
          subtitle={data.marketMovers[0]?.name ?? "No data"}
        />
      </div>

      {/* Chart + movers */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-4">Portfolio Performance</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.portfolioHistory}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(168, 100%, 48%)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="hsl(168, 100%, 48%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "hsl(230, 15%, 55%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "hsl(230, 15%, 55%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} domain={["dataMin - 2000", "dataMax + 2000"]} />
              <Tooltip
                contentStyle={{ background: "hsl(230, 28%, 8%)", border: "1px solid hsl(231, 18%, 16%)", borderRadius: "6px", fontFamily: "IBM Plex Mono", fontSize: "12px" }}
                labelStyle={{ color: "hsl(230, 15%, 55%)" }}
                itemStyle={{ color: "hsl(233, 38%, 92%)" }}
                formatter={(v: number) => [fmt(v), "Value"]}
              />
              <Area type="monotone" dataKey="value" stroke="hsl(168, 100%, 48%)" strokeWidth={1.5} fill="url(#portfolioGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4">
          {/* Market Movers */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Market Movers</div>
            <div className="space-y-3">
              {data.marketMovers.map((m) => (
                <div key={m.symbol} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-secondary flex items-center justify-center">
                      <span className="text-[9px] font-mono font-semibold text-foreground">{m.symbol.slice(0, 2)}</span>
                    </div>
                    <span className="text-xs font-mono text-foreground">{m.symbol}</span>
                  </div>
                  <span className={cn("text-xs font-mono", m.change >= 0 ? "text-positive" : "text-negative")}>
                    {m.change >= 0 ? "+" : ""}{m.change}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Recent Activity</div>
            <div className="space-y-3">
              {data.recentActivity.map((a) => (
                <div key={a.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-foreground">{a.amount}</div>
                    <div className="text-[10px] text-muted-foreground">{a.time}</div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-mono px-2 py-0.5 rounded",
                    a.type === "Buy" ? "bg-positive/10 text-positive" : a.type === "Sell" ? "bg-negative/10 text-negative" : "bg-secondary text-muted-foreground"
                  )}>
                    {a.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Holdings</div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Asset", "Price", "Balance", "Value", "Allocation", "24h", "Trend"].map((h) => (
                <th key={h} className="py-3 px-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.assets.map((a) => (
              <AssetRow key={a.id} asset={a} onClick={() => onSelectAsset(a)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
