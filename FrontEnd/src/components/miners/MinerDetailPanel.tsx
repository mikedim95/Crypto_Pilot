import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RotateCcw, Gauge, Square, Play, Pause, Power, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MinerStatusBadge } from "./MinerStatusBadge";
import type { MinerDetailResponse, MinerHistoryPoint } from "@/types/api";

interface MinerDetailPanelProps {
  details: MinerDetailResponse;
  history: MinerHistoryPoint[];
  isCommandPending: boolean;
  isPresetPending: boolean;
  isThermalSettingsPending: boolean;
  onClose: () => void;
  onCommand: (action: "restart" | "reboot" | "start" | "stop" | "pause" | "resume") => void;
  onOpenLivePage: (minerId: number) => void;
  onSwitchPool: (poolId: number) => void;
  onApplyPreset: (preset: string) => void;
  onSaveThermalSettings: (settings: {
    temperatureControlEnabled: boolean;
    temperatureControlMin: number | null;
    temperatureControlMax: number | null;
  }) => void;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}

function isValidTemperature(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 150;
}

function parseTemperatureInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 150) {
    return Number.NaN;
  }
  return parsed;
}

export function MinerDetailPanel({
  details,
  history,
  isCommandPending,
  isPresetPending,
  isThermalSettingsPending,
  onClose,
  onCommand,
  onOpenLivePage,
  onSwitchPool,
  onApplyPreset,
  onSaveThermalSettings,
}: MinerDetailPanelProps) {
  const { miner, liveData, presets, commands } = details;
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [temperatureControlEnabled, setTemperatureControlEnabled] = useState(false);
  const [temperatureControlMin, setTemperatureControlMin] = useState("");
  const [temperatureControlMax, setTemperatureControlMax] = useState("");

  useEffect(() => {
    setSelectedPreset(liveData.presetName ?? presets[0]?.name ?? "");
  }, [liveData.presetName, presets]);

  useEffect(() => {
    setTemperatureControlEnabled(miner.temperatureControlEnabled);
    setTemperatureControlMin(
      typeof miner.temperatureControlMin === "number" ? String(miner.temperatureControlMin) : "",
    );
    setTemperatureControlMax(
      typeof miner.temperatureControlMax === "number" ? String(miner.temperatureControlMax) : "",
    );
  }, [miner.temperatureControlEnabled, miner.temperatureControlMax, miner.temperatureControlMin]);

  const canApplyPreset = selectedPreset.length > 0 && selectedPreset !== (liveData.presetName ?? "") && !isPresetPending;
  const parsedTemperatureControlMin = parseTemperatureInput(temperatureControlMin);
  const parsedTemperatureControlMax = parseTemperatureInput(temperatureControlMax);
  const thermalInputsInvalid =
    Number.isNaN(parsedTemperatureControlMin) || Number.isNaN(parsedTemperatureControlMax);
  const thermalBoundsInvalid =
    temperatureControlEnabled &&
    !thermalInputsInvalid &&
    (parsedTemperatureControlMin === null ||
      parsedTemperatureControlMax === null ||
      parsedTemperatureControlMin >= parsedTemperatureControlMax);
  const hottestTemp = [...liveData.boardTemps, ...liveData.hotspotTemps].filter(isValidTemperature).reduce<number | null>(
    (max, value) => (max === null ? value : Math.max(max, value)),
    null,
  );
  const thermalSettingsChanged =
    temperatureControlEnabled !== miner.temperatureControlEnabled ||
    (parsedTemperatureControlMin ?? null) !== miner.temperatureControlMin ||
    (parsedTemperatureControlMax ?? null) !== miner.temperatureControlMax;
  const canSaveThermalSettings =
    thermalSettingsChanged && !thermalInputsInvalid && !thermalBoundsInvalid && !isThermalSettingsPending;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm animate-overlay-fade" onClick={onClose}>
      <div
        className="h-full w-full max-w-4xl overflow-y-auto border-l border-border bg-card animate-slide-in-right"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="font-mono text-lg font-semibold text-foreground">{miner.name}</h2>
                <MinerStatusBadge online={liveData.online} minerState={liveData.minerState} />
              </div>
              <div className="mt-1 text-xs font-mono text-muted-foreground">
                {miner.model ?? "Unknown model"} | {miner.ip} | {miner.firmware ?? "Unknown firmware"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" className="gap-2 font-mono text-xs" onClick={() => onOpenLivePage(miner.id)}>
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Open Live Page</span>
                <span className="sm:hidden">Live</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6 p-4 stagger-children">
          <section className="space-y-3">
            <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Overview</div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <Metric label="State" value={liveData.minerState ?? "--"} />
              <Metric label="Preset" value={liveData.presetPretty ?? liveData.presetName ?? "--"} />
              <Metric label="Rate" value={typeof liveData.totalRateThs === "number" ? `${liveData.totalRateThs.toFixed(2)} TH/s` : "--"} />
              <Metric label="Fan Duty" value={typeof liveData.fanPwm === "number" ? `${liveData.fanPwm}%` : "--"} />
              <Metric label="Power" value={typeof liveData.powerWatts === "number" ? `${liveData.powerWatts} W` : "--"} />
              <Metric label="Last Seen" value={liveData.lastSeenAt ? new Date(liveData.lastSeenAt).toLocaleString() : "--"} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Thermal</div>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              <div className="rounded-md border border-border bg-secondary/20 p-4 md:col-span-2">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Preset Temperature Control</div>
                    <div className="font-mono text-sm text-foreground">
                      Keep the hottest valid sensor between a per-miner min/max band. When the miner is colder than the
                      minimum it steps up one preset. When it gets hotter than the maximum it steps down one preset.
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      Hottest temp now: {hottestTemp !== null ? `${hottestTemp}C` : "--"}
                      {miner.temperatureControlLastAdjustedAt
                        ? ` | Last auto change: ${new Date(miner.temperatureControlLastAdjustedAt).toLocaleString()}`
                        : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      {temperatureControlEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={temperatureControlEnabled}
                      disabled={isThermalSettingsPending}
                      onCheckedChange={setTemperatureControlEnabled}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,160px)_minmax(0,160px)_auto]">
                  <Input
                    type="number"
                    min={1}
                    max={150}
                    step={1}
                    className="font-mono text-sm"
                    placeholder="Min hottest temp"
                    value={temperatureControlMin}
                    disabled={isThermalSettingsPending}
                    onChange={(event) => setTemperatureControlMin(event.target.value)}
                  />
                  <Input
                    type="number"
                    min={1}
                    max={150}
                    step={1}
                    className="font-mono text-sm"
                    placeholder="Max hottest temp"
                    value={temperatureControlMax}
                    disabled={isThermalSettingsPending}
                    onChange={(event) => setTemperatureControlMax(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    className="font-mono text-sm"
                    disabled={!canSaveThermalSettings}
                    onClick={() =>
                      onSaveThermalSettings({
                        temperatureControlEnabled,
                        temperatureControlMin: parsedTemperatureControlMin ?? null,
                        temperatureControlMax: parsedTemperatureControlMax ?? null,
                      })
                    }
                  >
                    {isThermalSettingsPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Thermal Control
                  </Button>
                </div>

                {thermalInputsInvalid ? (
                  <div className="mt-3 font-mono text-xs text-negative">
                    Temperatures must be whole numbers between 1C and 150C.
                  </div>
                ) : null}
                {thermalBoundsInvalid ? (
                  <div className="mt-3 font-mono text-xs text-negative">
                    Thermal control needs both temperatures, and the minimum must stay lower than the maximum.
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-border bg-secondary/20 p-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Board Temps</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {liveData.boardTemps.length > 0
                    ? liveData.boardTemps.map((temp, index) => (
                        <span key={`board-${index}`} className="rounded-md bg-background px-3 py-2 font-mono text-sm text-foreground">
                          Board {index + 1}: {temp}C
                        </span>
                      ))
                    : <span className="font-mono text-sm text-muted-foreground">No board temp data.</span>}
                </div>
              </div>

              <div className="rounded-md border border-border bg-secondary/20 p-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Hotspot Temps</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {liveData.hotspotTemps.length > 0
                    ? liveData.hotspotTemps.map((temp, index) => (
                        <span key={`hotspot-${index}`} className="rounded-md bg-background px-3 py-2 font-mono text-sm text-foreground">
                          Hotspot {index + 1}: {temp}C
                        </span>
                      ))
                    : <span className="font-mono text-sm text-muted-foreground">No hotspot data.</span>}
                </div>
              </div>

              <div className="rounded-md border border-border bg-secondary/20 p-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Chip Temps</div>
                <div className="mt-3 space-y-2 font-mono text-sm text-foreground">
                  {liveData.chipTempStrings.length > 0
                    ? liveData.chipTempStrings.map((entry) => <div key={entry}>{entry}</div>)
                    : <div className="text-muted-foreground">No chip temp strings.</div>}
                </div>
              </div>

              <div className="rounded-md border border-border bg-secondary/20 p-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">PCB Temps</div>
                <div className="mt-3 space-y-2 font-mono text-sm text-foreground">
                  {liveData.pcbTempStrings.length > 0
                    ? liveData.pcbTempStrings.map((entry) => <div key={entry}>{entry}</div>)
                    : <div className="text-muted-foreground">No PCB temp strings.</div>}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Chains</div>
            <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="rounded-md border border-border bg-secondary/20 p-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Chain {index + 1}</div>
                  <div className="mt-2 font-mono text-sm text-foreground">
                    Rate: {typeof liveData.chainRates[index] === "number" ? `${liveData.chainRates[index].toFixed(2)} TH/s` : "--"}
                  </div>
                  <div className="mt-1 font-mono text-sm text-muted-foreground">
                    State: {liveData.chainStates[index] ?? "--"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Pools</div>
            <div className="space-y-3">
              {liveData.pools.map((pool, index) => (
                <div key={`${pool.id}-${index}`} className="flex flex-col gap-3 rounded-md border border-border bg-secondary/20 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-foreground break-all">{pool.url}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      Worker: {pool.user} | Status: {pool.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {liveData.poolActiveIndex === index ? (
                      <span className="rounded-full bg-positive/10 px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-positive">
                        Active
                      </span>
                    ) : null}
                    <Button
                      variant="outline"
                      className="font-mono text-sm"
                      disabled={isCommandPending || liveData.poolActiveIndex === index}
                      onClick={() => onSwitchPool(pool.id)}
                    >
                      Switch Pool
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Commands</div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
              {[
                { label: "Restart Mining", action: "restart" as const, icon: RotateCcw },
                { label: "Start", action: "start" as const, icon: Play },
                { label: "Stop", action: "stop" as const, icon: Square },
                { label: "Pause", action: "pause" as const, icon: Pause },
                { label: "Resume", action: "resume" as const, icon: Play },
                { label: "Reboot", action: "reboot" as const, icon: Power },
              ].map((actionItem) => (
                <Button
                  key={actionItem.label}
                  variant="outline"
                  className="h-auto justify-start gap-3 py-4 font-mono text-sm"
                  disabled={isCommandPending}
                  onClick={() => onCommand(actionItem.action)}
                >
                  {isCommandPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <actionItem.icon className="h-4 w-4" />}
                  {actionItem.label}
                </Button>
              ))}
            </div>

            <div className="rounded-md border border-border bg-secondary/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Autotune Presets</div>
              </div>

              {presets.length > 0 ? (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px]">
                  <Select value={selectedPreset} onValueChange={setSelectedPreset} disabled={isPresetPending}>
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue placeholder="Choose preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((preset) => (
                        <SelectItem key={preset.name} value={preset.name} className="font-mono text-sm">
                          {preset.pretty ?? preset.name}
                          {preset.status ? ` | ${preset.status}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="font-mono text-sm"
                    disabled={!canApplyPreset}
                    onClick={() => onApplyPreset(selectedPreset)}
                  >
                    {isPresetPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Apply Preset
                  </Button>
                </div>
              ) : (
                <div className="font-mono text-sm text-muted-foreground">No presets discovered from VNish for this miner yet.</div>
              )}

              {presets.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {presets.map((preset) => {
                    const isCurrent = preset.name === liveData.presetName;
                    return (
                      <span
                        key={preset.name}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-mono ${
                          isCurrent
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "bg-background text-muted-foreground border border-border"
                        }`}
                      >
                        {preset.pretty ?? preset.name}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-border bg-secondary/20 p-4">
              <div className="mb-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Recent Commands</div>
              <div className="space-y-2">
                {commands.slice(0, 8).map((command) => (
                  <div key={command.id} className="rounded-md bg-background px-3 py-2 font-mono text-sm text-foreground">
                    {command.commandType} | {command.status} | {new Date(command.createdAt).toLocaleString()}
                    {command.errorText ? ` | ${command.errorText}` : ""}
                  </div>
                ))}
                {commands.length === 0 ? <div className="font-mono text-sm text-muted-foreground">No commands logged yet.</div> : null}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-mono uppercase tracking-wider text-muted-foreground">History</div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[700px]">
                <thead className="bg-secondary/30">
                  <tr>
                    {["Time", "Online", "Rate", "Power", "Board Max", "Hotspot Max", "Fan PWM"].map((label) => (
                      <th key={label} className="px-3 py-2 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map((point) => (
                    <tr key={point.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-sm text-foreground">{new Date(point.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono text-sm text-foreground">{point.online ? "yes" : "no"}</td>
                      <td className="px-3 py-2 font-mono text-sm text-foreground">
                        {typeof point.totalRateThs === "number" ? `${point.totalRateThs.toFixed(2)} TH/s` : "--"}
                      </td>
                      <td className="px-3 py-2 font-mono text-sm text-foreground">{typeof point.powerWatts === "number" ? `${point.powerWatts} W` : "--"}</td>
                      <td className="px-3 py-2 font-mono text-sm text-foreground">
                        {point.boardTemps.length > 0 ? `${Math.max(...point.boardTemps)}C` : "--"}
                      </td>
                      <td className="px-3 py-2 font-mono text-sm text-foreground">
                        {point.hotspotTemps.length > 0 ? `${Math.max(...point.hotspotTemps)}C` : "--"}
                      </td>
                      <td className="px-3 py-2 font-mono text-sm text-foreground">{typeof point.fanPwm === "number" ? `${point.fanPwm}%` : "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
