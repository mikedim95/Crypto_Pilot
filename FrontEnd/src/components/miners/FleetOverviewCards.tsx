import { Activity, Cpu, Flame, Gauge, Power } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { FleetOverview } from "@/types/api";

interface FleetOverviewCardsProps {
  overview?: FleetOverview;
  isLoading?: boolean;
}

function formatValue(value: number | null | undefined, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}${suffix}`;
}

export function FleetOverviewCards({ overview, isLoading = false }: FleetOverviewCardsProps) {
  const cards = [
    {
      label: "Miners Online",
      value: overview ? `${overview.onlineMiners} / ${overview.totalMiners}` : "--",
      sub: overview ? `${overview.enabledMiners} enabled` : "Awaiting backend data",
      icon: Cpu,
      tone: "text-positive",
    },
    {
      label: "Fleet Rate",
      value: overview ? `${formatValue(overview.totalRateThs, " TH/s")}` : "--",
      sub: "Latest backend snapshot",
      icon: Activity,
      tone: "text-primary",
    },
    {
      label: "Fleet Power",
      value: overview ? `${formatValue((overview.totalPowerWatts ?? 0) / 1000, " kW")}` : "--",
      sub: overview?.totalPowerWatts ? `${overview.totalPowerWatts.toLocaleString()} W` : "No power data yet",
      icon: Power,
      tone: "text-foreground",
    },
    {
      label: "Hottest Board",
      value: overview?.hottestBoardTemp !== null && overview?.hottestBoardTemp !== undefined ? `${overview.hottestBoardTemp}C` : "--",
      sub: overview?.hottestHotspotTemp !== null && overview?.hottestHotspotTemp !== undefined ? `Hotspot ${overview.hottestHotspotTemp}C` : "Hotspot pending",
      icon: Flame,
      tone: "text-amber-400",
    },
    {
      label: "Generated",
      value: overview?.generatedAt ? new Date(overview.generatedAt).toLocaleTimeString() : "--",
      sub: "Refreshes every 60s",
      icon: Gauge,
      tone: "text-sky-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5 stagger-children">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`group min-w-0 rounded-lg border border-border bg-card p-3 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(var(--primary)/0.08)] hover:-translate-y-0.5 sm:p-4 ${card.label === "Generated" ? "col-span-2 md:col-span-1" : ""}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="min-w-0 truncate text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px] sm:tracking-wider">{card.label}</span>
            <card.icon className={`h-4 w-4 shrink-0 ${card.tone} transition-transform duration-300 group-hover:scale-110`} />
          </div>
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="mt-2 h-4 w-28" />
            </>
          ) : (
            <>
              <div className={`truncate text-base font-mono font-semibold sm:text-lg md:text-xl ${card.tone}`}>{card.value}</div>
              <div className="mt-1 truncate text-[11px] font-mono text-muted-foreground sm:text-xs">{card.sub}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
