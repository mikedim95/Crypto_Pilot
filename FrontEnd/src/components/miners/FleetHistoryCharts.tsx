import { useEffect, useMemo, useState } from "react";
import { Activity, Flame, Loader2, TrendingUp } from "lucide-react";
import { Brush, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FleetHistoryScope, FleetHistorySeries, MinerTimelineAlert } from "@/types/api";

interface FleetHistoryChartsProps {
  history: FleetHistorySeries[];
  scope: FleetHistoryScope;
  onScopeChange: (scope: FleetHistoryScope) => void;
  isLoading?: boolean;
  selectedAlert?: MinerTimelineAlert | null;
}

const SERIES_COLORS = [
  "#00f5d4",
  "#ff9f1c",
  "#4cc9f0",
  "#f72585",
  "#84cc16",
  "#fb7185",
  "#38bdf8",
  "#eab308",
  "#c084fc",
  "#22c55e",
] as const;

const SCOPE_OPTIONS: Array<{ value: FleetHistoryScope; label: string }> = [
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

type ChartMetricKey = "totalRateThs" | "maxTemp";
type BrushWindow = { startIndex: number; endIndex: number };

function isFiniteMetricValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isChartMetricValue(value: number | null | undefined, metric: ChartMetricKey): value is number {
  if (!isFiniteMetricValue(value)) return false;
  return metric === "totalRateThs" ? value > 0 : true;
}

function formatAxisTime(value: string, scope: FleetHistoryScope): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  if (scope === "hour" || scope === "day") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatTooltipTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "--";
}

function getSeriesMeta(history: FleetHistorySeries[], metric: ChartMetricKey) {
  return history
    .filter((series) => series.points.some((point) => isChartMetricValue(point[metric], metric)))
    .map((series, index) => ({
      key: `miner_${series.minerId}`,
      label: `${series.minerName} (${series.minerIp})`,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));
}

function buildChartRows(history: FleetHistorySeries[], metric: ChartMetricKey) {
  const rows = new Map<string, Record<string, string | number | null>>();
  for (const series of history) {
    const key = `miner_${series.minerId}`;
    for (const point of series.points) {
      const timestamp = String(point.timestamp);
      const parsedTime = new Date(timestamp).getTime();
      if (!Number.isFinite(parsedTime)) continue;

      const row = rows.get(point.timestamp) ?? { timestamp: point.timestamp };
      row[key] = isChartMetricValue(point[metric], metric) ? point[metric] : null;
      rows.set(timestamp, row);
    }
  }
  return Array.from(rows.values()).sort((left, right) => {
    const leftTime = new Date(String(left.timestamp)).getTime();
    const rightTime = new Date(String(right.timestamp)).getTime();
    return leftTime - rightTime;
  });
}

function buildFleetRateRows(history: FleetHistorySeries[]) {
  const rows = new Map<string, { timestamp: string; totalRateThs: number; onlineMiners: number }>();

  for (const series of history) {
    for (const point of series.points) {
      const timestamp = String(point.timestamp);
      const parsedTime = new Date(timestamp).getTime();
      if (!Number.isFinite(parsedTime)) continue;

      const row = rows.get(timestamp) ?? { timestamp, totalRateThs: 0, onlineMiners: 0 };
      if (isChartMetricValue(point.totalRateThs, "totalRateThs")) {
        row.totalRateThs += point.totalRateThs;
      }
      if (point.online) {
        row.onlineMiners += 1;
      }
      rows.set(timestamp, row);
    }
  }

  return Array.from(rows.values())
    .filter((row) => row.totalRateThs > 0)
    .map((row) => ({ ...row, totalRateThs: Number(row.totalRateThs.toFixed(2)) }))
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

function getHistoryTimestampCount(history: FleetHistorySeries[]) {
  const timestamps = new Set<string>();
  for (const series of history) {
    for (const point of series.points) {
      const timestamp = String(point.timestamp);
      if (Number.isFinite(new Date(timestamp).getTime())) {
        timestamps.add(timestamp);
      }
    }
  }
  return timestamps.size;
}

function getDefaultBrushWindow(scope: FleetHistoryScope, rowCount: number) {
  const sizeByScope: Record<FleetHistoryScope, number> = { hour: 60, day: 96, week: 168, month: 120 };
  const desiredSize = sizeByScope[scope];
  const startIndex = Math.max(0, rowCount - desiredSize);
  const endIndex = Math.max(0, rowCount - 1);
  return { startIndex, endIndex };
}

function getBrushWindowAroundIndex(scope: FleetHistoryScope, rowCount: number, index: number): BrushWindow {
  if (rowCount <= 0) return { startIndex: 0, endIndex: 0 };
  const defaultWindow = getDefaultBrushWindow(scope, rowCount);
  const windowSize = Math.max(1, defaultWindow.endIndex - defaultWindow.startIndex + 1);
  const halfWindow = Math.floor(windowSize / 2);
  const startIndex = Math.max(0, Math.min(Math.max(0, rowCount - windowSize), index - halfWindow));
  return { startIndex, endIndex: Math.min(rowCount - 1, startIndex + windowSize - 1) };
}

function clampBrushIndex(value: number, rowCount: number): number {
  if (!Number.isFinite(value)) return Math.max(0, rowCount - 1);
  return Math.max(0, Math.min(Math.max(0, rowCount - 1), Math.trunc(value)));
}

function normalizeBrushWindow(
  next: { startIndex?: number; endIndex?: number } | undefined,
  previous: BrushWindow,
  rowCount: number
) {
  if (rowCount <= 0) return { startIndex: 0, endIndex: 0 };
  const safeStart = Number.isFinite(next?.startIndex) ? clampBrushIndex(next?.startIndex as number, rowCount) : previous.startIndex;
  const safeEnd = Number.isFinite(next?.endIndex) ? clampBrushIndex(next?.endIndex as number, rowCount) : previous.endIndex;
  if (safeStart <= safeEnd) return { startIndex: safeStart, endIndex: safeEnd };
  return { startIndex: safeEnd, endIndex: safeStart };
}

function findNearestRowIndex(rows: Array<{ timestamp?: unknown }>, timestamp: string | undefined): number | null {
  if (!timestamp || rows.length === 0) return null;
  const targetTime = new Date(timestamp).getTime();
  if (!Number.isFinite(targetTime)) return null;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  rows.forEach((row, index) => {
    const rowTime = new Date(String(row.timestamp)).getTime();
    if (!Number.isFinite(rowTime)) return;
    const distance = Math.abs(rowTime - targetTime);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestDistance === Number.POSITIVE_INFINITY ? null : nearestIndex;
}

function referenceLabel(alert: MinerTimelineAlert | null | undefined): string {
  return alert ? `${alert.emoji} ${formatAxisTime(alert.timestamp, "hour")}` : "";
}

function getVisibleMetricValues(
  rows: Array<Record<string, string | number | null>>,
  seriesMeta: Array<{ key: string }>,
  brushWindow: BrushWindow
) {
  return rows.slice(brushWindow.startIndex, brushWindow.endIndex + 1).flatMap((row) =>
    seriesMeta
      .map((series) => row[series.key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

function getHashrateDomain(values: number[]): [number, number] {
  if (values.length === 0) return [1, 100];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  if (minValue === maxValue) {
    return [Math.max(0.1, minValue * 0.9), maxValue * 1.1];
  }
  return [Math.max(0.1, minValue * 0.94), maxValue * 1.06];
}

function getHashrateTicks(domain: [number, number]) {
  const [minValue, maxValue] = domain;
  const ratio = maxValue / minValue;
  if (ratio > 8) {
    const minPower = Math.floor(Math.log10(minValue));
    const maxPower = Math.ceil(Math.log10(maxValue));
    return Array.from({ length: maxPower - minPower + 1 }, (_, index) => 10 ** (minPower + index)).filter(
      (tick) => tick >= minValue && tick <= maxValue
    );
  }

  const rawStep = (maxValue - minValue) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
  const step = Math.max(1, Math.ceil(rawStep / magnitude) * magnitude);
  const first = Math.ceil(minValue / step) * step;
  const ticks = Array.from({ length: 6 }, (_, index) => first + index * step).filter((tick) => tick <= maxValue);
  return ticks.length >= 2 ? ticks : [minValue, maxValue];
}

function getFleetRateDomain(rows: Array<{ totalRateThs: number }>): [number, number] {
  if (rows.length === 0) return [0, 100];
  const maxValue = Math.max(...rows.map((row) => row.totalRateThs));
  return [0, Math.max(10, maxValue * 1.08)];
}

function FleetChartTooltip({
  active,
  label,
  payload,
  unit,
  metric,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ color?: string; name?: string | number; value?: number | string | null }>;
  unit: string;
  metric: ChartMetricKey;
}) {
  const items =
    payload?.filter((item): item is { color?: string; name?: string | number; value: number } => typeof item.value === "number") ?? [];

  if (!active || items.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-[#0f1320] px-3 py-3 font-mono text-xs shadow-xl">
      <div className="mb-2 whitespace-nowrap text-muted-foreground">{formatTooltipTime(String(label))}</div>
      <div className="space-y-2">
        {items.map((item) => {
          const color = item.color ?? "hsl(var(--foreground))";
          return (
            <div key={`${item.name}-${item.value}`} className="flex items-center justify-between gap-6 whitespace-nowrap" style={{ color }}>
              <span>{item.name}</span>
              <span>
                {item.value.toFixed(metric === "totalRateThs" ? 2 : 1)} {unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FleetRateTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload?: { totalRateThs?: number; onlineMiners?: number }; value?: number | string | null }>;
}) {
  const item = payload?.find((entry) => typeof entry.value === "number");
  if (!active || !item || typeof item.value !== "number") return null;

  return (
    <div className="rounded-md border border-border bg-[#0f1320] px-3 py-3 font-mono text-xs shadow-xl">
      <div className="mb-2 whitespace-nowrap text-muted-foreground">{formatTooltipTime(String(label))}</div>
      <div className="flex items-center justify-between gap-6 whitespace-nowrap text-primary">
        <span>Fleet Rate</span>
        <span>{item.value.toFixed(2)} TH/s</span>
      </div>
      <div className="mt-2 text-muted-foreground">
        Online miners: {typeof item.payload?.onlineMiners === "number" ? item.payload.onlineMiners : "--"}
      </div>
    </div>
  );
}

function FleetRateChartCard({
  history,
  scope,
  brushWindow,
  selectedAlert,
  isLoading = false,
}: {
  history: FleetHistorySeries[];
  scope: FleetHistoryScope;
  brushWindow: BrushWindow;
  selectedAlert?: MinerTimelineAlert | null;
  isLoading?: boolean;
}) {
  const rows = useMemo(() => buildFleetRateRows(history), [history]);
  const safeBrushWindow = useMemo(
    () => normalizeBrushWindow(brushWindow, getDefaultBrushWindow(scope, rows.length), rows.length),
    [brushWindow, rows.length, scope]
  );
  const visibleRows = useMemo(() => rows.slice(safeBrushWindow.startIndex, safeBrushWindow.endIndex + 1), [rows, safeBrushWindow]);
  const hasData = visibleRows.length > 0;
  const rateDomain = useMemo(() => getFleetRateDomain(visibleRows), [visibleRows]);
  const highlightedIndex = useMemo(() => findNearestRowIndex(rows, selectedAlert?.timestamp), [rows, selectedAlert?.timestamp]);
  const highlightedTimestamp =
    highlightedIndex !== null && highlightedIndex >= safeBrushWindow.startIndex && highlightedIndex <= safeBrushWindow.endIndex
      ? rows[highlightedIndex]?.timestamp
      : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-fade-up">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Overall Fleet Rate</div>
          <div className="mt-1 text-sm font-mono text-muted-foreground hidden md:block">
            Total persisted fleet hashrate in TH/s across all online miners.
          </div>
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <TrendingUp className="h-4 w-4 text-primary" />}
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart syncId="fleet-history" data={visibleRows} margin={{ top: 12, right: 28, left: 8, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => formatAxisTime(String(value), scope)}
              minTickGap={24}
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "hsl(230, 15%, 55%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => `${value.toFixed(0)} TH`}
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "hsl(230, 15%, 55%)" }}
              width={72}
              axisLine={false}
              tickLine={false}
              domain={rateDomain}
            />
            <Tooltip content={<FleetRateTooltip />} wrapperStyle={{ outline: "none" }} />
            {highlightedTimestamp ? (
              <ReferenceLine
                x={highlightedTimestamp}
                stroke={selectedAlert?.color ?? "#00f5d4"}
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{ value: referenceLabel(selectedAlert), position: "top", fill: selectedAlert?.color ?? "#00f5d4", fontSize: 11 }}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="totalRateThs"
              name="Fleet Rate"
              stroke="#00f5d4"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-border/80 bg-secondary/20">
          <div className="max-w-sm text-center">
            <div className="text-sm font-mono text-foreground">No overall fleet hashrate data yet.</div>
            <div className="mt-2 text-xs font-mono text-muted-foreground">
              The chart fills automatically as miner snapshots are written into MySQL by the fleet poller.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  history,
  metric,
  scope,
  unit,
  brushWindow,
  onBrushChange,
  selectedAlert,
  showBrush = false,
  isLoading = false,
}: {
  title: string; subtitle: string; icon: typeof Activity; history: FleetHistorySeries[];
  metric: ChartMetricKey; scope: FleetHistoryScope; unit: string; brushWindow: BrushWindow;
  onBrushChange: (next: { startIndex?: number; endIndex?: number } | undefined, rowCount: number) => void;
  selectedAlert?: MinerTimelineAlert | null;
  showBrush?: boolean; isLoading?: boolean;
}) {
  const seriesMeta = useMemo(() => getSeriesMeta(history, metric), [history, metric]);
  const rows = useMemo(() => buildChartRows(history, metric), [history, metric]);
  const hasData = rows.length > 0 && seriesMeta.length > 0;
  const safeBrushWindow = useMemo(
    () => normalizeBrushWindow(brushWindow, getDefaultBrushWindow(scope, rows.length), rows.length),
    [brushWindow, rows.length, scope]
  );
  const visibleRows = useMemo(() => rows.slice(safeBrushWindow.startIndex, safeBrushWindow.endIndex + 1), [rows, safeBrushWindow]);
  const chartRows = showBrush ? rows : visibleRows;
  const visibleHashrateValues = useMemo(
    () => getVisibleMetricValues(rows, seriesMeta, safeBrushWindow),
    [rows, seriesMeta, safeBrushWindow]
  );
  const hashrateDomain = useMemo(() => getHashrateDomain(visibleHashrateValues), [visibleHashrateValues]);
  const hashrateTicks = useMemo(() => getHashrateTicks(hashrateDomain), [hashrateDomain]);
  const highlightedIndex = useMemo(() => findNearestRowIndex(rows, selectedAlert?.timestamp), [rows, selectedAlert?.timestamp]);
  const highlightedTimestamp =
    highlightedIndex !== null && highlightedIndex >= safeBrushWindow.startIndex && highlightedIndex <= safeBrushWindow.endIndex
      ? rows[highlightedIndex]?.timestamp
      : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-fade-up">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{title}</div>
          <div className="mt-1 text-sm font-mono text-muted-foreground hidden md:block">{subtitle}</div>
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Icon className="h-4 w-4 text-primary" />}
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={420}>
          <LineChart syncId="fleet-history" data={chartRows} margin={{ top: 12, right: 28, left: 8, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => formatAxisTime(String(value), scope)}
              minTickGap={24}
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "hsl(230, 15%, 55%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => (metric === "totalRateThs" ? `${value.toFixed(0)} TH` : `${value.toFixed(0)}C`)}
              tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "hsl(230, 15%, 55%)" }}
              width={72}
              axisLine={false}
              tickLine={false}
              scale={metric === "totalRateThs" ? "log" : "auto"}
              domain={metric === "totalRateThs" ? hashrateDomain : ["auto", "auto"]}
              allowDataOverflow={metric === "totalRateThs"}
              ticks={metric === "totalRateThs" ? hashrateTicks : undefined}
            />
            <Tooltip
              content={<FleetChartTooltip unit={unit} metric={metric} />}
              wrapperStyle={{ outline: "none" }}
            />
            <Legend wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: "11px", paddingTop: "14px" }} />
            {highlightedTimestamp ? (
              <ReferenceLine
                x={highlightedTimestamp}
                stroke={selectedAlert?.color ?? "#00f5d4"}
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{ value: referenceLabel(selectedAlert), position: "top", fill: selectedAlert?.color ?? "#00f5d4", fontSize: 11 }}
              />
            ) : null}
            {seriesMeta.map((series, idx) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={true}
                animationDuration={1200 + idx * 200}
                animationEasing="ease-out"
              />
            ))}
            {showBrush && rows.length > 1 ? (
              <Brush
                dataKey="timestamp"
                startIndex={safeBrushWindow.startIndex}
                endIndex={safeBrushWindow.endIndex}
                onChange={(next) => onBrushChange(next, rows.length)}
                height={26}
                travellerWidth={10}
                stroke="#00f5d4"
                fill="rgba(10, 14, 26, 0.9)"
                tickFormatter={(value) => formatAxisTime(String(value), scope)}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[420px] items-center justify-center rounded-lg border border-dashed border-border/80 bg-secondary/20">
          <div className="max-w-sm text-center">
            <div className="text-sm font-mono text-foreground">
              No historical {metric === "totalRateThs" ? "hashrate" : "temperature"} data yet.
            </div>
            <div className="mt-2 text-xs font-mono text-muted-foreground">
              The chart fills automatically as miner snapshots are written into MySQL by the fleet poller.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FleetHistoryCharts({ history, scope, onScopeChange, isLoading = false, selectedAlert = null }: FleetHistoryChartsProps) {
  const rowCount = useMemo(() => getHistoryTimestampCount(history), [history]);
  const fleetRateRows = useMemo(() => buildFleetRateRows(history), [history]);
  const [brushWindow, setBrushWindow] = useState<BrushWindow>(() => getDefaultBrushWindow(scope, rowCount));

  useEffect(() => {
    setBrushWindow(getDefaultBrushWindow(scope, rowCount));
  }, [scope, rowCount]);

  useEffect(() => {
    const selectedIndex = findNearestRowIndex(fleetRateRows, selectedAlert?.timestamp);
    if (selectedIndex === null) return;
    setBrushWindow(getBrushWindowAroundIndex(scope, fleetRateRows.length, selectedIndex));
  }, [fleetRateRows, scope, selectedAlert?.id, selectedAlert?.timestamp]);

  const handleBrushChange = (next: { startIndex?: number; endIndex?: number } | undefined, chartRowCount: number) => {
    setBrushWindow((previous) => normalizeBrushWindow(next, previous, chartRowCount));
  };

  return (
    <div id="fleet-history-charts" className="space-y-4 scroll-mt-20">
      <div className="flex flex-col md:flex-row flex-wrap items-start md:items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">History Scope</div>
          <div className="mt-1 text-sm font-mono text-muted-foreground hidden md:block">
            Hashrate is plotted on a logarithmic scale in TH/s. The shared slider controls both history charts.
          </div>
          {selectedAlert ? (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md border px-3 py-2 text-xs font-mono" style={{ borderColor: selectedAlert.color, color: selectedAlert.color }}>
              <span>{selectedAlert.emoji}</span>
              <span className="truncate">{selectedAlert.title} at {formatTooltipTime(selectedAlert.timestamp)}</span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {SCOPE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={scope === option.value ? "default" : "outline"}
              className={cn("font-mono text-sm", scope === option.value ? "shadow-[0_0_0_1px_rgba(0,245,212,0.35)_inset]" : "")}
              onClick={() => onScopeChange(option.value)}
              disabled={isLoading}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <FleetRateChartCard history={history} scope={scope} brushWindow={brushWindow} selectedAlert={selectedAlert} isLoading={isLoading} />
        <ChartCard
          title="Fleet Hashrate History"
          subtitle="Per-miner hashrate in TH/s from persisted backend snapshots."
          icon={Activity}
          history={history}
          metric="totalRateThs"
          scope={scope}
          unit="TH/s"
          brushWindow={brushWindow}
          onBrushChange={handleBrushChange}
          selectedAlert={selectedAlert}
          isLoading={isLoading}
        />
        <ChartCard
          title="Fleet Temperature History"
          subtitle="Highest valid miner temperature per snapshot. Invalid zero readings are ignored."
          icon={Flame}
          history={history}
          metric="maxTemp"
          scope={scope}
          unit="C"
          brushWindow={brushWindow}
          onBrushChange={handleBrushChange}
          selectedAlert={selectedAlert}
          showBrush={true}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
