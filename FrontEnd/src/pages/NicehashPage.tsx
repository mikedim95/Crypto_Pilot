import { Lock } from "lucide-react";
import { SpinnerValue } from "@/components/SpinnerValue";
import { useNicehashOverview } from "@/hooks/useTradingData";

export function NicehashPage() {
  const { data, isPending, error } = useNicehashOverview();
  const isLoading = isPending && !data;

  const miners = data?.miners ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-mono font-semibold text-foreground">NiceHash</h2>
        <p className="text-sm text-muted-foreground mt-1">Basic NiceHash mining status and assignment summary.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Pool Status</div>
          <SpinnerValue
            loading={isLoading}
            value={data?.poolStatus ?? (data?.connected ? "Connected" : undefined)}
            className={`mt-2 text-xl font-mono font-semibold ${data?.connected ? "text-positive" : "text-muted-foreground"}`}
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Assigned Miners</div>
          <SpinnerValue
            loading={isLoading}
            value={data?.assignedMiners ?? undefined}
            className="mt-2 text-xl font-mono font-semibold text-foreground"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Hashrate</div>
          <SpinnerValue
            loading={isLoading}
            value={data?.hashrateTH !== null && data?.hashrateTH !== undefined ? `${data.hashrateTH.toFixed(3)} TH/s` : undefined}
            className="mt-2 text-xl font-mono font-semibold text-foreground"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Est. Daily Revenue</div>
          <SpinnerValue
            loading={isLoading}
            value={
              data?.estimatedDailyRevenueUSD !== null && data?.estimatedDailyRevenueUSD !== undefined
                ? `$${data.estimatedDailyRevenueUSD.toFixed(2)}`
                : undefined
            }
            className="mt-2 text-xl font-mono font-semibold text-foreground"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Pool Details</div>
        <div className="text-sm font-mono text-foreground">
          Name: <SpinnerValue loading={isLoading} value={data?.poolName ?? undefined} />
        </div>
        <div className="text-sm font-mono text-foreground">
          URL: <SpinnerValue loading={isLoading} value={data?.poolUrl ?? undefined} />
        </div>
        <div className="text-sm font-mono text-foreground">
          Algorithm: <SpinnerValue loading={isLoading} value={data?.algorithm ?? undefined} />
        </div>
        <div className="text-sm font-mono text-foreground">
          Power Draw:{" "}
          <SpinnerValue
            loading={isLoading}
            value={data?.powerW !== null && data?.powerW !== undefined ? `${(data.powerW / 1000).toFixed(2)} kW` : undefined}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Assigned Miners</div>
        </div>

        {isLoading ? (
          <div className="px-5 py-6">
            <SpinnerValue loading value={undefined} />
          </div>
        ) : miners.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            No live NiceHash miner records received yet. Configure `MINERS_BASIC_JSON` or NiceHash env fields.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Miner", "Model", "Status", "Hashrate", "Power", "Est. Revenue"].map((heading) => (
                  <th
                    key={heading}
                    className="py-3 px-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-right first:text-left"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {miners.map((miner) => (
                <tr key={miner.id} className="border-b border-border">
                  <td className="py-3 px-4 text-sm font-mono text-foreground">{miner.name}</td>
                  <td className="py-3 px-4 text-right text-sm font-mono text-muted-foreground">{miner.model}</td>
                  <td className="py-3 px-4 text-right text-sm font-mono text-foreground">{miner.status}</td>
                  <td className="py-3 px-4 text-right text-sm font-mono text-foreground">
                    {miner.hashrateTH !== null ? `${miner.hashrateTH.toFixed(3)} TH/s` : "--"}
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-mono text-foreground">
                    {miner.powerW !== null ? `${miner.powerW} W` : "--"}
                  </td>
                  <td className="py-3 px-4 text-right text-sm font-mono text-foreground">
                    {miner.estimatedDailyRevenueUSD !== null ? `$${miner.estimatedDailyRevenueUSD.toFixed(2)}` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && !data ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-xs text-negative">
          {error instanceof Error ? error.message : "Failed to load NiceHash data."}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-secondary/40 p-4 text-[11px] text-muted-foreground">
        <div className="inline-flex items-center gap-1 font-mono uppercase tracking-wider">
          <Lock className="h-3 w-3" />
          Coming Soon
        </div>
        <div className="mt-1">
          Profit switching, wallet management, benchmark controls, and payout analytics are inactive for now.
        </div>
      </div>
    </div>
  );
}
