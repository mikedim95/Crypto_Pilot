import { X, RotateCcw, Square, Play, Zap, FlaskConical, Lightbulb, Terminal, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MinerStatusBadge } from "./MinerStatusBadge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Miner } from "@/data/minerMockData";

interface Props {
  miner: Miner;
  onClose: () => void;
}

export function MinerDetailPanel({ miner: m, onClose }: Props) {
  const actions = [
    { icon: RotateCcw, label: "Reboot" },
    { icon: Square, label: "Stop" },
    { icon: Play, label: "Resume" },
    { icon: Zap, label: "Apply Profile" },
    { icon: FlaskConical, label: "Benchmark" },
    { icon: Lightbulb, label: "Blink LED" },
    { icon: Terminal, label: "Console" },
    { icon: Download, label: "Update FW" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border-l border-border h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-lg font-semibold text-foreground">{m.name}</h2>
              <MinerStatusBadge status={m.status} />
            </div>
            <div className="text-xs font-mono text-muted-foreground mt-1">{m.model} · {m.ip} · {m.firmware}</div>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <Tabs defaultValue="summary" className="p-4">
          <TabsList className="w-full justify-start bg-secondary/30 mb-4">
            <TabsTrigger value="summary" className="font-mono text-xs">Summary</TabsTrigger>
            <TabsTrigger value="performance" className="font-mono text-xs">Performance</TabsTrigger>
            <TabsTrigger value="hardware" className="font-mono text-xs">Hardware</TabsTrigger>
            <TabsTrigger value="pools" className="font-mono text-xs">Pools</TabsTrigger>
            <TabsTrigger value="config" className="font-mono text-xs">Config</TabsTrigger>
            <TabsTrigger value="actions" className="font-mono text-xs">Actions</TabsTrigger>
          </TabsList>

          {/* Summary */}
          <TabsContent value="summary">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Name", m.name], ["Model", m.model], ["Serial", m.serial], ["Firmware", m.firmware],
                ["IP Address", m.ip], ["MAC", m.mac], ["Status", m.status], ["Uptime", m.uptime || "—"],
                ["Last Seen", m.lastSeen], ["Algorithm", m.algorithm],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-secondary/30 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="font-mono text-sm text-foreground mt-1">{v}</div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Performance */}
          <TabsContent value="performance">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Hashrate", `${m.hashrate} ${m.hashrateUnit}`],
                ["24h Average", `${m.avgHashrate24h} ${m.hashrateUnit}`],
                ["Accepted Shares", m.acceptedShares.toLocaleString()],
                ["Rejected Shares", m.rejectedShares.toLocaleString()],
                ["Reject Rate", `${((m.rejectedShares / (m.acceptedShares + m.rejectedShares)) * 100).toFixed(2)}%`],
                ["Pool Latency", `${m.poolLatency} ms`],
                ["Efficiency", `${m.efficiency} J/TH`],
                ["Est. Earnings", `$${m.earningsEstimate.toFixed(2)} /day`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-secondary/30 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="font-mono text-sm text-foreground mt-1">{v}</div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Hardware */}
          <TabsContent value="hardware">
            <div className="space-y-3">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Hashboards</div>
              {m.hashboards.map(hb => (
                <div key={hb.id} className={cn("rounded-md border p-3", hb.status === "OK" ? "border-border" : hb.status === "Warning" ? "border-[hsl(45,100%,50%)]" : "border-negative")}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-semibold">{hb.id}</span>
                    <span className={cn("text-[10px] font-mono uppercase", hb.status === "OK" ? "text-positive" : hb.status === "Warning" ? "text-[hsl(45,100%,50%)]" : "text-negative")}>{hb.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div><span className="text-muted-foreground">Temp: </span><span className={hb.temp > 80 ? "text-negative" : "text-foreground"}>{hb.temp > 0 ? `${hb.temp}°C` : "—"}</span></div>
                    <div><span className="text-muted-foreground">Chips: </span><span className={hb.chips < hb.chipTotal ? "text-[hsl(45,100%,50%)]" : "text-foreground"}>{hb.chips}/{hb.chipTotal}</span></div>
                    <div><span className="text-muted-foreground">Health: </span><span>{hb.chipTotal > 0 ? `${Math.round(hb.chips / hb.chipTotal * 100)}%` : "—"}</span></div>
                  </div>
                </div>
              ))}
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mt-4 mb-2">Fans & Thermals</div>
              <div className="grid grid-cols-2 gap-3">
                {m.fanSpeeds.map((f, i) => (
                  <div key={i} className="rounded-md bg-secondary/30 p-3">
                    <div className="text-[10px] font-mono text-muted-foreground">Fan {i + 1}</div>
                    <div className="font-mono text-sm">{f > 0 ? `${f} RPM` : "—"}</div>
                  </div>
                ))}
                {m.boardTemps.map((t, i) => (
                  <div key={`bt${i}`} className="rounded-md bg-secondary/30 p-3">
                    <div className="text-[10px] font-mono text-muted-foreground">Board {i + 1} Temp</div>
                    <div className={cn("font-mono text-sm", t > 75 ? "text-negative" : "text-foreground")}>{t > 0 ? `${t}°C` : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Pools */}
          <TabsContent value="pools">
            <div className="space-y-3">
              {["Primary", "Secondary"].map((label, i) => (
                <div key={label} className="rounded-md border border-border p-4 space-y-3">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label} Pool</div>
                  <div className="space-y-2">
                    <div><label className="text-[10px] font-mono text-muted-foreground">URL</label><input className="w-full mt-1 rounded-md border border-border bg-secondary/30 px-3 py-2 font-mono text-xs text-foreground" defaultValue={i === 0 ? `stratum+tcp://${m.pool}.com:3333` : ""} readOnly /></div>
                    <div><label className="text-[10px] font-mono text-muted-foreground">Worker</label><input className="w-full mt-1 rounded-md border border-border bg-secondary/30 px-3 py-2 font-mono text-xs text-foreground" defaultValue={m.worker} readOnly /></div>
                    <div><label className="text-[10px] font-mono text-muted-foreground">Password</label><input className="w-full mt-1 rounded-md border border-border bg-secondary/30 px-3 py-2 font-mono text-xs text-muted-foreground" defaultValue="••••••" type="password" readOnly /></div>
                  </div>
                  {i === 0 && <div className="text-[10px] font-mono text-positive">● Connected</div>}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Config */}
          <TabsContent value="config">
            <div className="space-y-4">
              <div className="rounded-md border border-border p-4 space-y-4">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Power & Performance</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-foreground">Power Mode</label>
                    <Select defaultValue={m.powerMode}>
                      <SelectTrigger className="w-40 h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Normal">Normal</SelectItem>
                        <SelectItem value="High Performance">High Performance</SelectItem>
                        <SelectItem value="Eco">Eco</SelectItem>
                        <SelectItem value="Efficiency">Efficiency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-mono text-foreground">Target Frequency</label>
                      <span className="text-xs font-mono text-muted-foreground">{m.targetFreq} MHz</span>
                    </div>
                    <Slider defaultValue={[m.targetFreq]} min={300} max={800} step={10} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-mono text-foreground">Target Voltage</label>
                      <span className="text-xs font-mono text-muted-foreground">{m.targetVoltage}V</span>
                    </div>
                    <Slider defaultValue={[m.targetVoltage * 10]} min={120} max={160} step={1} />
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-border p-4 space-y-4">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Fan Control</div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-foreground">Fan Mode</label>
                  <Select defaultValue={m.fanMode}>
                    <SelectTrigger className="w-40 h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto">Auto</SelectItem>
                      <SelectItem value="Manual">Manual</SelectItem>
                      <SelectItem value="Max">Max</SelectItem>
                      <SelectItem value="Quiet">Quiet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-foreground">Auto Fan</label>
                  <Switch defaultChecked={m.fanMode === "Auto"} />
                </div>
              </div>
              <div className="rounded-md border border-border p-4 space-y-4">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Scheduling</div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-foreground">Performance Preset</label>
                  <Select defaultValue="balanced">
                    <SelectTrigger className="w-40 h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="turbo">Turbo</SelectItem>
                      <SelectItem value="lowpower">Low Power</SelectItem>
                      <SelectItem value="silent">Silent Night</SelectItem>
                      <SelectItem value="efficiency">Max Efficiency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-foreground">Low Power Mode</label>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-foreground">Scheduled Reboot</label>
                  <Select defaultValue="none">
                    <SelectTrigger className="w-40 h-8 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="daily">Daily 4AM</SelectItem>
                      <SelectItem value="weekly">Weekly Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Actions */}
          <TabsContent value="actions">
            <div className="grid grid-cols-2 gap-3">
              {actions.map(a => (
                <Button key={a.label} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 font-mono text-xs" disabled>
                  <a.icon className="h-5 w-5 text-muted-foreground" />
                  {a.label}
                  <span className="text-[9px] text-muted-foreground">Not connected</span>
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
