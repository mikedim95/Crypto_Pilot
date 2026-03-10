import { Search, Bell } from "lucide-react";
import { useDashboardData } from "@/hooks/useTradingData";
import { SpinnerValue } from "@/components/SpinnerValue";

export function TopBar() {
  const { data, isPending } = useDashboardData();
  const isLoading = isPending && !data;

  const formatCurrency = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const connectionLabel = data
    ? data.connection.connected
      ? data.connection.testnet
        ? "TESTNET"
        : "LIVE"
      : "OFFLINE"
    : "--";

  const connectionTone = data?.connection.connected
    ? "bg-positive/10 text-positive"
    : "bg-secondary text-muted-foreground";

  const changePct = data?.portfolioChange24h;
  const changeValue = data?.portfolioChange24hValue;

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card">
      <div className="flex items-center gap-3 bg-secondary rounded-md px-3 py-2 w-72">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search assets, pairs..."
          className="bg-transparent text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none w-full"
        />
        <kbd className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">Ctrl+K</kbd>
      </div>

      <div className="flex items-center gap-6">
        <span className={`text-[10px] font-mono px-2 py-1 rounded ${connectionTone}`} title={data?.connection.message}>
          <SpinnerValue loading={isLoading} value={connectionLabel} spinnerClassName="h-3.5 w-3.5" />
        </span>

        <div className="text-right">
          <div className="text-xs font-mono text-muted-foreground">Portfolio Value</div>
          <div className="flex items-center gap-2">
            <SpinnerValue
              loading={isLoading}
              value={data ? formatCurrency(data.totalPortfolioValue) : undefined}
              className="text-sm font-mono font-semibold text-foreground"
            />

            <SpinnerValue
              loading={isLoading}
              value={
                changePct !== undefined
                  ? `${changePct >= 0 ? "+" : ""}${changePct}%`
                  : undefined
              }
              className={`text-xs font-mono ${changePct !== undefined && changePct < 0 ? "text-negative" : "text-positive"}`}
            />

            <SpinnerValue
              loading={isLoading}
              value={
                changeValue !== undefined
                  ? `(${changeValue >= 0 ? "+" : ""}${formatCurrency(changeValue)})`
                  : undefined
              }
              className={`text-xs font-mono ${changeValue !== undefined && changeValue < 0 ? "text-negative" : "text-positive"}`}
            />
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
