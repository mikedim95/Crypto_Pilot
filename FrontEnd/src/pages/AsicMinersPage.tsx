import { Lock } from "lucide-react";
import { SpinnerValue } from "@/components/SpinnerValue";
import { useMiningOverview } from "@/hooks/useTradingData";

export function AsicMinersPage() {
  const { data, isPending, error } = useMiningOverview();
  const isLoading = isPending && !data;

  const miners = data?.miners ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-mono font-semibold text-foreground">ASIC Miners</h2>
        <p className="text-sm text-muted-foreground mt-1">Basic fleet status overview.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Active Miners</div>
          <SpinnerValue
            loading={isLoading}
            value={
              data && data.activeMiners !== null && data.totalMiners !== null
                ? `${data.activeMiners} / ${data.totalMiners}`
                : undefined
            }
            className="mt-2 text-xl font-mono font-semibold text-foreground"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Total Hashrate</div>
          <SpinnerValue
            loading={isLoading}
            value={data?.totalHashrateTH !== null && data?.totalHashrateTH !== undefined ? `${data.totalHashrateTH.toFixed(2)} TH/s` : undefined}
            className="mt-2 text-xl font-mono font-semibold text-foreground"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Total Power</div>
          <SpinnerValue
            loading={isLoading}
            value={data?.totalPowerW !== null && data?.totalPowerW !== undefined ? `${(data.totalPowerW / 1000).toFixed(2)} kW` : undefined}
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
          <div className="mt-1 text-[11px] font-mono text-muted-foreground">
            Avg chip temp{" "}
            <SpinnerValue
              loading={isLoading}
              value={
                data?.averageChipTempC !== null && data?.averageChipTempC !== undefined
                  ? `${data.averageChipTempC.toFixed(1)}C`
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Miner List</div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Miner", "Model", "Status", "Hashrate", "Power", "Pool", "Last Seen"].map((heading) => (
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
            {isLoading
              ? Array.from({ length: 3 }).map((_, rowIndex) => (
                  <tr key={`mining-loading-${rowIndex}`} className="border-b border-border">
                    {Array.from({ length: 7 }).map((__, colIndex) => (
                      <td key={`mining-loading-cell-${rowIndex}-${colIndex}`} className="py-3 px-4 text-right first:text-left">
                        <div className="inline-flex">
                          <SpinnerValue loading value={undefined} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              : miners.map((miner) => (
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
                    <td className="py-3 px-4 text-right text-sm font-mono text-foreground">{miner.pool ?? "--"}</td>
                    <td className="py-3 px-4 text-right text-sm font-mono text-muted-foreground">{miner.lastSeen ?? "--"}</td>
                  </tr>
                ))}
          </tbody>
        </table>

        {!isLoading && miners.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            No live miner records received yet. Configure `MINERS_BASIC_JSON` in backend `.env`.
          </div>
        ) : null}
      </div>

      {error && !data ? (
        <div className="rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-xs text-negative">
          {error instanceof Error ? error.message : "Failed to load ASIC miner data."}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-secondary/40 p-4 text-[11px] text-muted-foreground">
        <div className="inline-flex items-center gap-1 font-mono uppercase tracking-wider">
          <Lock className="h-3 w-3" />
          Coming Soon
        </div>
        <div className="mt-1">
          Remote controls, alerts, profiles, pool switching, and maintenance tools are inactive for now.
        </div>
      </div>
    </div>
  );
}
