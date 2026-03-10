import { AssetRow } from "@/components/AssetRow";
import { Asset } from "@/data/mockData";
import { useDashboardData } from "@/hooks/useTradingData";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface PortfolioPageProps {
  onSelectAsset: (asset: Asset) => void;
}

const COLORS = [
  "hsl(168, 100%, 48%)", "hsl(230, 60%, 60%)", "hsl(340, 100%, 62%)",
  "hsl(45, 100%, 60%)", "hsl(280, 60%, 60%)", "hsl(200, 80%, 50%)"
];

export function PortfolioPage({ onSelectAsset }: PortfolioPageProps) {
  const { data } = useDashboardData();
  const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const pieData = data.assets.map((a) => ({ name: a.symbol, value: a.allocation }));
  const largest = [...data.assets].sort((a, b) => b.allocation - a.allocation)[0];

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Allocation chart */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-4">Asset Allocation</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" stroke="none">
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(230, 28%, 8%)", border: "1px solid hsl(231, 18%, 16%)", borderRadius: "6px", fontFamily: "IBM Plex Mono", fontSize: "12px" }}
                itemStyle={{ color: "hsl(233, 38%, 92%)" }}
                formatter={(v: number) => [`${v}%`, "Allocation"]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2">
            {data.assets.map((a, i) => (
              <div key={a.id} className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-[10px] font-mono text-muted-foreground">{a.symbol} {a.allocation}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="col-span-2 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Total Value</div>
              <div className="text-lg font-mono font-semibold text-foreground">{fmt(data.totalPortfolioValue)}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Assets</div>
              <div className="text-lg font-mono font-semibold text-foreground">{data.assets.length}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Largest Position</div>
              <div className="text-lg font-mono font-semibold text-foreground">
                {largest ? `${largest.symbol} ${largest.allocation.toFixed(1)}%` : "--"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">All Holdings</div>
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
            {data.assets.map((a) => <AssetRow key={a.id} asset={a} onClick={() => onSelectAsset(a)} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
