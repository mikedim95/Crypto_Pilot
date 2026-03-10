import { cn } from "@/lib/utils";
import { useDashboardData } from "@/hooks/useTradingData";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const COLORS = [
  "hsl(168, 100%, 48%)", "hsl(230, 60%, 60%)", "hsl(340, 100%, 62%)",
  "hsl(45, 100%, 60%)", "hsl(280, 60%, 60%)", "hsl(200, 80%, 50%)"
];

export function RebalancePage() {
  const { data } = useDashboardData();
  const currentData = data.assets.map((a) => ({ name: a.symbol, value: a.allocation }));
  const targetData = data.assets.map((a) => ({ name: a.symbol, value: a.targetAllocation }));

  return (
    <div className="p-6 space-y-6">
      {/* Charts side by side with overlap concept */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-4 text-center">Current Allocation</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={currentData} cx="50%" cy="50%" innerRadius={55} outerRadius={100} dataKey="value" stroke="none" label={({ name, value }) => `${name} ${value}%`}>
                {currentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-4 text-center">Target Allocation</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={targetData} cx="50%" cy="50%" innerRadius={55} outerRadius={100} dataKey="value" stroke="none" label={({ name, value }) => `${name} ${value}%`}>
                {targetData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Rebalance Preview</div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Asset", "Current", "Target", "Difference", "Action"].map((h) => (
                <th key={h} className="py-3 px-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.assets.map((a) => {
              const diff = a.targetAllocation - a.allocation;
              return (
                <tr key={a.id} className="border-b border-border">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-secondary flex items-center justify-center">
                        <span className="text-[9px] font-mono font-semibold text-foreground">{a.symbol.slice(0, 2)}</span>
                      </div>
                      <span className="text-sm font-mono text-foreground">{a.symbol}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-foreground">{a.allocation}%</td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-foreground">{a.targetAllocation}%</td>
                  <td className={cn("py-3 px-4 text-right font-mono text-sm", diff > 0 ? "text-positive" : diff < 0 ? "text-negative" : "text-muted-foreground")}>
                    {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={cn(
                      "text-[10px] font-mono px-2 py-1 rounded",
                      diff > 0 ? "bg-positive/10 text-positive" : diff < 0 ? "bg-negative/10 text-negative" : "bg-secondary text-muted-foreground"
                    )}>
                      {diff > 0 ? "Buy" : diff < 0 ? "Sell" : "Hold"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button className="px-6 py-2.5 rounded-md border border-border text-sm font-mono text-foreground hover:bg-secondary transition-colors">
          Preview Rebalance
        </button>
        <button className="px-6 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-mono font-semibold hover:opacity-90 transition-opacity">
          Execute Rebalance
        </button>
      </div>
    </div>
  );
}
