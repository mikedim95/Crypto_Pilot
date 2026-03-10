import { Search, Bell } from "lucide-react";
import { useDashboardData } from "@/hooks/useTradingData";

export function TopBar() {
  const { data } = useDashboardData();

  const formatCurrency = (v: number) =>
    v.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const connectionLabel = data.connection.connected
    ? data.connection.testnet
      ? "TESTNET"
      : "LIVE"
    : "DEMO";

  const connectionTone = data.connection.connected
    ? "bg-positive/10 text-positive"
    : "bg-secondary text-muted-foreground";

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card">
      {/* Search */}
      <div className="flex items-center gap-3 bg-secondary rounded-md px-3 py-2 w-72">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search assets, pairs..."
          className="bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none w-full"
        />
        <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">⌘K</kbd>
      </div>

      {/* Portfolio Summary + Actions */}
      <div className="flex items-center gap-6">
        <span className={`text-[10px] font-mono px-2 py-1 rounded ${connectionTone}`} title={data.connection.message}>
          {connectionLabel}
        </span>
        <div className="text-right">
          <div className="text-xs font-mono text-muted-foreground">Portfolio Value</div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-semibold text-foreground">
              {formatCurrency(data.totalPortfolioValue)}
            </span>
            <span className={`text-xs font-mono ${data.portfolioChange24h >= 0 ? "text-positive" : "text-negative"}`}>
              {data.portfolioChange24h >= 0 ? "+" : ""}{data.portfolioChange24h}%
            </span>
            <span className={`text-xs font-mono ${data.portfolioChange24hValue >= 0 ? "text-positive" : "text-negative"}`}>
              ({data.portfolioChange24hValue >= 0 ? "+" : ""}{formatCurrency(data.portfolioChange24hValue)})
            </span>
          </div>
        </div>

        <button className="relative p-2 rounded-md hover:bg-secondary transition-colors">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>

        <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
          <span className="text-xs font-mono font-semibold text-foreground">JD</span>
        </div>
      </div>
    </header>
  );
}
