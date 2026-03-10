import { cn } from "@/lib/utils";
import { useOrdersData } from "@/hooks/useTradingData";

export function OrdersPage() {
  const { data } = useOrdersData();
  const orders = data?.orders ?? [];
  const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-mono font-semibold text-foreground">Orders</h2>
        <p className="text-sm text-muted-foreground mt-1">Your recent order history.</p>
      </div>

      <div className="bg-card border border-border rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Time", "Pair", "Side", "Price", "Amount", "Status"].map((h) => (
                <th key={h} className="py-3 px-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border hover:bg-surface-hover transition-colors">
                <td className="py-3 px-4 text-sm font-mono text-muted-foreground">{o.time}</td>
                <td className="py-3 px-4 text-right text-sm font-mono text-foreground">{o.pair}</td>
                <td className="py-3 px-4 text-right">
                  <span className={cn("text-xs font-mono px-2 py-0.5 rounded",
                    o.side === "Buy" ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
                  )}>{o.side}</span>
                </td>
                <td className="py-3 px-4 text-right font-mono text-sm text-foreground">{fmt(o.price)}</td>
                <td className="py-3 px-4 text-right font-mono text-sm text-foreground">{o.amount}</td>
                <td className="py-3 px-4 text-right">
                  <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded",
                    o.status === "Filled" ? "bg-positive/10 text-positive" :
                    o.status === "Pending" ? "bg-secondary text-foreground" :
                    "bg-negative/10 text-negative"
                  )}>{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
