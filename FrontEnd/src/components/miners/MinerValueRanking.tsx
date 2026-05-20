import { Activity, Clock3, Flame, Gauge, Percent, Thermometer, Trophy, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MinerEntity, MinerLiveData } from "@/types/api";

type RankingTrait = "value" | "thermalYield" | "hashrate" | "efficiency" | "rejectRate" | "thermal" | "uptime";

interface MinerValueRankingProps {
  miners: MinerEntity[];
  fleetLive: MinerLiveData[];
  isLoading?: boolean;
}

interface MinerRankingRow {
  miner: MinerEntity;
  live?: MinerLiveData;
  valueScore: number;
  hashrateScore: number;
  thermalScore: number;
  uptimeScore: number;
  efficiencyScore: number;
  thermalYieldScore: number;
  rejectRateScore: number;
  hashrateThs: number | null;
  maxTemp: number | null;
  downtimeMinutes: number | null;
  efficiencyJth: number | null;
  thermalYieldThPerC: number | null;
  rejectRatePct: number | null;
  fanPwm: number | null;
  isOnline: boolean;
  identityKey: string;
  identityLabel: string;
  missing: string[];
}

const rankingTraits: Array<{
  id: RankingTrait;
  label: string;
  icon: typeof Trophy;
  description: string;
}> = [
  { id: "value", label: "Value", icon: Trophy, description: "Balanced score from TH/C, W/TH, reject rate, uptime, and raw TH/s." },
  { id: "thermalYield", label: "TH/C", icon: Thermometer, description: "Best current hashrate per hottest sensor degree first." },
  { id: "hashrate", label: "TH/s", icon: Activity, description: "Highest current hashrate first." },
  { id: "efficiency", label: "W/TH", icon: Zap, description: "Lower watts per TH ranks higher." },
  { id: "rejectRate", label: "Rejects", icon: Percent, description: "Lower accepted-pool reject rate ranks higher." },
  { id: "thermal", label: "Temps", icon: Flame, description: "Cooler miners rank higher." },
  { id: "uptime", label: "Downtime", icon: Clock3, description: "Online miners and recent telemetry rank higher." },
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getLiveMap(fleetLive: MinerLiveData[]): Map<number, MinerLiveData> {
  return new Map(fleetLive.map((miner) => [miner.minerId, miner]));
}

function validNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getMaxTemp(live: MinerLiveData | undefined): number | null {
  const temps = [...(live?.boardTemps ?? []), ...(live?.hotspotTemps ?? [])].filter((value) => Number.isFinite(value) && value > 0);
  return temps.length > 0 ? Math.max(...temps) : null;
}

function getDowntimeMinutes(miner: MinerEntity, live: MinerLiveData | undefined): number | null {
  if (live?.online) return 0;
  const timestamp = live?.lastSeenAt ?? miner.lastSeenAt;
  if (!timestamp) return null;
  const lastSeen = new Date(timestamp).getTime();
  if (!Number.isFinite(lastSeen)) return null;
  return Math.max(0, (Date.now() - lastSeen) / 60000);
}

function getMinerMac(miner: MinerEntity, live: MinerLiveData | undefined): string | null {
  return live?.macAddress ?? miner.macAddress ?? null;
}

function scoreThermals(maxTemp: number | null, isOnline: boolean): number {
  if (maxTemp === null) return isOnline ? 55 : 25;
  if (maxTemp <= 62) return 100;
  if (maxTemp <= 75) return clamp(100 - (maxTemp - 62) * 2.6);
  if (maxTemp <= 90) return clamp(66 - (maxTemp - 75) * 3.2);
  return clamp(18 - (maxTemp - 90) * 2);
}

function scoreUptime(downtimeMinutes: number | null, isOnline: boolean): number {
  if (isOnline) return 100;
  if (downtimeMinutes === null) return 0;
  if (downtimeMinutes <= 5) return 82;
  if (downtimeMinutes <= 60) return clamp(82 - ((downtimeMinutes - 5) / 55) * 38);
  if (downtimeMinutes <= 24 * 60) return clamp(44 - ((downtimeMinutes - 60) / (23 * 60)) * 34);
  return 0;
}

function getRejectRate(live: MinerLiveData | undefined): number | null {
  const activePool = live?.pools.find((pool, index) => live.poolActiveIndex === index) ?? live?.pools[0];
  const accepted = activePool?.accepted;
  const rejected = activePool?.rejected;
  if (!validNumber(accepted) || !validNumber(rejected)) return null;
  const total = accepted + rejected;
  return total > 0 ? (rejected / total) * 100 : null;
}

function formatDowntime(minutes: number | null): string {
  if (minutes === null) return "--";
  if (minutes === 0) return "Online";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 24 * 60) return `${round(minutes / 60)}h`;
  return `${round(minutes / (24 * 60))}d`;
}

function formatScore(value: number): string {
  return `${Math.round(value)}`;
}

function formatTraitValue(row: MinerRankingRow, trait: RankingTrait): string {
  switch (trait) {
    case "hashrate":
      return row.hashrateThs !== null ? `${row.hashrateThs.toFixed(2)} TH/s` : "--";
    case "thermalYield":
      return row.thermalYieldThPerC !== null ? `${row.thermalYieldThPerC.toFixed(3)} TH/C` : "--";
    case "thermal":
      return row.maxTemp !== null ? `${row.maxTemp}C` : "--";
    case "uptime":
      return formatDowntime(row.downtimeMinutes);
    case "efficiency":
      return row.efficiencyJth !== null ? `${row.efficiencyJth.toFixed(1)} W/TH` : "--";
    case "rejectRate":
      return row.rejectRatePct !== null ? `${row.rejectRatePct.toFixed(2)}%` : "--";
    case "value":
      return formatScore(row.valueScore);
  }
}

function getTraitScore(row: MinerRankingRow, trait: RankingTrait): number {
  switch (trait) {
    case "hashrate":
      return row.hashrateScore;
    case "thermalYield":
      return row.thermalYieldScore;
    case "thermal":
      return row.thermalScore;
    case "uptime":
      return row.uptimeScore;
    case "efficiency":
      return row.efficiencyScore;
    case "rejectRate":
      return row.rejectRateScore;
    case "value":
      return row.valueScore;
  }
}

function buildRows(miners: MinerEntity[], fleetLive: MinerLiveData[]): MinerRankingRow[] {
  const liveMap = getLiveMap(fleetLive);
  const rawRows = miners.map((miner) => {
    const live = liveMap.get(miner.id);
    const hashrateThs = validNumber(live?.totalRateThs) ? live.totalRateThs : null;
    const powerWatts = validNumber(live?.powerWatts) ? live.powerWatts : null;
    const efficiencyJth = hashrateThs !== null && hashrateThs > 0 && powerWatts !== null && powerWatts > 0 ? powerWatts / hashrateThs : null;
    const maxTemp = getMaxTemp(live);
    const isOnline = live?.online ?? false;
    const downtimeMinutes = getDowntimeMinutes(miner, live);
    const fanPwm = validNumber(live?.fanPwm) ? live.fanPwm : null;
    const macAddress = getMinerMac(miner, live);
    const thermalYieldThPerC = hashrateThs !== null && maxTemp !== null && maxTemp > 0 ? hashrateThs / maxTemp : null;
    const rejectRatePct = getRejectRate(live);

    return {
      miner,
      live,
      identityKey: macAddress ?? `miner-${miner.id}`,
      identityLabel: macAddress ?? "MAC pending",
      hashrateThs,
      maxTemp,
      downtimeMinutes,
      efficiencyJth,
      thermalYieldThPerC,
      rejectRatePct,
      fanPwm,
      isOnline,
    };
  });

  const maxHashrate = Math.max(...rawRows.map((row) => row.hashrateThs ?? 0), 0);
  const maxThermalYield = Math.max(...rawRows.map((row) => row.thermalYieldThPerC ?? 0), 0);
  const knownEfficiencies = rawRows.map((row) => row.efficiencyJth).filter(validNumber);
  const minEfficiency = knownEfficiencies.length > 0 ? Math.min(...knownEfficiencies) : null;
  const maxEfficiency = knownEfficiencies.length > 0 ? Math.max(...knownEfficiencies) : null;

  return rawRows.map((row) => {
    const hashrateScore = maxHashrate > 0 && row.hashrateThs !== null ? clamp((row.hashrateThs / maxHashrate) * 100) : 0;
    const thermalYieldScore =
      maxThermalYield > 0 && row.thermalYieldThPerC !== null ? clamp((row.thermalYieldThPerC / maxThermalYield) * 100) : 0;
    const thermalScore = scoreThermals(row.maxTemp, row.isOnline);
    const uptimeScore = scoreUptime(row.downtimeMinutes, row.isOnline);
    const efficiencyScore =
      row.efficiencyJth !== null && minEfficiency !== null && maxEfficiency !== null
        ? maxEfficiency === minEfficiency
          ? 100
          : clamp(100 - ((row.efficiencyJth - minEfficiency) / (maxEfficiency - minEfficiency)) * 100)
        : 50;
    const rejectRateScore = row.rejectRatePct !== null ? clamp(100 - row.rejectRatePct * 20) : 65;
    const valueScore = clamp(
      thermalYieldScore * 0.34 + efficiencyScore * 0.24 + rejectRateScore * 0.16 + uptimeScore * 0.16 + hashrateScore * 0.1
    );
    const missing = [
      row.hashrateThs === null ? "rate" : null,
      row.maxTemp === null ? "temp" : null,
      row.efficiencyJth === null ? "power" : null,
      row.rejectRatePct === null ? "shares" : null,
      row.downtimeMinutes === null ? "last seen" : null,
      row.identityLabel === "MAC pending" ? "MAC" : null,
    ].filter(Boolean) as string[];

    return {
      ...row,
      valueScore,
      hashrateScore,
      thermalScore,
      uptimeScore,
      efficiencyScore,
      thermalYieldScore,
      rejectRateScore,
      missing,
    };
  });
}

export function MinerValueRanking({ miners, fleetLive, isLoading = false }: MinerValueRankingProps) {
  const [selectedTrait, setSelectedTrait] = useState<RankingTrait>("value");
  const activeTrait = rankingTraits.find((trait) => trait.id === selectedTrait) ?? rankingTraits[0];
  const rankedRows = useMemo(() => {
    const rowsByMac = buildRows(miners, fleetLive).reduce<Map<string, MinerRankingRow>>((accumulator, row) => {
      const existing = accumulator.get(row.identityKey);
      if (!existing || getTraitScore(row, selectedTrait) > getTraitScore(existing, selectedTrait)) {
        accumulator.set(row.identityKey, row);
      }
      return accumulator;
    }, new Map());

    return Array.from(rowsByMac.values()).sort((left, right) => {
      const traitDelta = getTraitScore(right, selectedTrait) - getTraitScore(left, selectedTrait);
      if (traitDelta !== 0) return traitDelta;
      return right.valueScore - left.valueScore;
    });
  }, [fleetLive, miners, selectedTrait]);

  return (
    <section className="rounded-lg border border-border bg-card p-3 animate-fade-up sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Miner Value Ranking</div>
          <div className="mt-1 font-mono text-sm text-foreground">{activeTrait.description}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {rankingTraits.map((trait) => {
            const Icon = trait.icon;
            const isActive = trait.id === selectedTrait;

            return (
              <Button
                key={trait.id}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="h-8 gap-2 px-2.5 font-mono text-xs"
                onClick={() => setSelectedTrait(trait.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {trait.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={`miner-value-ranking-${index}`} className="h-20 rounded-md" />)
        ) : rankedRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-background/45 px-4 py-8 text-center text-sm font-mono text-muted-foreground">
            No miners available to rank.
          </div>
        ) : (
          rankedRows.map((row, index) => {
            const traitScore = getTraitScore(row, selectedTrait);
            const isTop = index === 0;

            return (
              <div
                key={row.identityKey}
                className={cn(
                  "rounded-md border bg-background/45 p-3 transition-colors",
                  isTop ? "border-primary/40 bg-primary/5" : "border-border/75",
                )}
              >
                <div className="grid gap-3 md:grid-cols-[48px_minmax(0,1fr)_minmax(120px,180px)] md:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card font-mono text-sm font-semibold text-foreground">
                    #{index + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <div className="truncate font-mono text-sm font-semibold text-foreground">{row.identityLabel}</div>
                      <span className={cn("font-mono text-[11px]", row.isOnline ? "text-positive" : "text-negative")}>
                        {row.isOnline ? "online" : "offline"}
                      </span>
                      {row.missing.length > 0 ? (
                        <span className="font-mono text-[11px] text-muted-foreground">Missing {row.missing.join(", ")}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {row.miner.name} | {row.miner.model ?? "Unknown model"} | Current IP {row.miner.ip}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                      <div className="font-mono text-xs text-muted-foreground">
                        <Thermometer className="mr-1 inline h-3.5 w-3.5 text-primary" />
                        {row.thermalYieldThPerC !== null ? `${row.thermalYieldThPerC.toFixed(3)} TH/C` : "--"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        <Gauge className="mr-1 inline h-3.5 w-3.5 text-primary" />
                        {row.hashrateThs !== null ? `${row.hashrateThs.toFixed(2)} TH/s` : "--"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        <Flame className="mr-1 inline h-3.5 w-3.5 text-amber-400" />
                        {row.maxTemp !== null ? `${row.maxTemp}C` : "--"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        <Clock3 className="mr-1 inline h-3.5 w-3.5 text-sky-300" />
                        {formatDowntime(row.downtimeMinutes)}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        <Zap className="mr-1 inline h-3.5 w-3.5 text-positive" />
                        {row.efficiencyJth !== null ? `${row.efficiencyJth.toFixed(1)} W/TH` : "--"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        <Percent className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                        {row.rejectRatePct !== null ? `${row.rejectRatePct.toFixed(2)}% reject` : "--"}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{activeTrait.label}</div>
                      <div className="font-mono text-sm font-semibold text-foreground">{formatTraitValue(row, selectedTrait)}</div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${clamp(traitScore)}%` }} />
                    </div>
                    <div className="mt-1 text-right font-mono text-[11px] text-muted-foreground">Score {formatScore(traitScore)}/100</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
