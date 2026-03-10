import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FleetOverviewCards } from "@/components/miners/FleetOverviewCards";
import { MinerTable } from "@/components/miners/MinerTable";
import { MinerDetailPanel } from "@/components/miners/MinerDetailPanel";
import { MinerStatusBadge } from "@/components/miners/MinerStatusBadge";
import { BulkActionToolbar } from "@/components/miners/BulkActionToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Lock, Search, AlertTriangle, Thermometer, Cpu, Activity, DollarSign, Wifi, WifiOff, Info, CheckCircle, Clock, Wrench, Shield } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import {
  miners, minerAlerts, minerProfiles, minerPools,
  fleetHashrateHistory, fleetPowerHistory, fleetTempHistory,
  type Miner, type MinerAlert as MinerAlertType,
} from "@/data/minerMockData";

export function AsicMinersPage() {
  const [selectedMiner, setSelectedMiner] = useState<Miner | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [alertFilter, setAlertFilter] = useState<string>("all");

  const filteredMiners = miners.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.ip.includes(searchQuery)
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelectedIds(prev => prev.size === filteredMiners.length ? new Set() : new Set(filteredMiners.map(m => m.id)));
  };

  const filteredAlerts = minerAlerts.filter(a => alertFilter === "all" || a.severity === alertFilter || a.status === alertFilter);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">ASIC Miners</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">Fleet monitoring and control center</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search miners..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-8 w-56 font-mono text-xs bg-secondary/30 border-border"
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-secondary/30">
          <TabsTrigger value="overview" className="font-mono text-xs">Overview</TabsTrigger>
          <TabsTrigger value="miners" className="font-mono text-xs">Miners</TabsTrigger>
          <TabsTrigger value="alerts" className="font-mono text-xs">Alerts</TabsTrigger>
          <TabsTrigger value="profiles" className="font-mono text-xs">Profiles</TabsTrigger>
          <TabsTrigger value="pools" className="font-mono text-xs">Pools</TabsTrigger>
          <TabsTrigger value="maintenance" className="font-mono text-xs">Maintenance</TabsTrigger>
          <TabsTrigger value="settings" className="font-mono text-xs">Settings</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <FleetOverviewCards />
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { title: "Fleet Hashrate (TH/s)", data: fleetHashrateHistory, key: "hashrate", color: "hsl(168,100%,48%)" },
              { title: "Power Consumption (W)", data: fleetPowerHistory, key: "power", color: "hsl(340,100%,62%)" },
              { title: "Avg Temperature (°C)", data: fleetTempHistory, key: "avgTemp", color: "hsl(45,100%,50%)" },
            ].map(chart => (
              <div key={chart.title} className="rounded-lg border border-border bg-card p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">{chart.title}</div>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chart.data}>
                    <defs><linearGradient id={`g-${chart.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chart.color} stopOpacity={0.3} /><stop offset="100%" stopColor={chart.color} stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="time" tick={{ fontSize: 9, fontFamily: "IBM Plex Mono", fill: "hsl(230,15%,55%)" }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "hsl(230,28%,8%)", border: "1px solid hsl(231,18%,16%)", borderRadius: 6, fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                    <Area type="monotone" dataKey={chart.key} stroke={chart.color} fill={`url(#g-${chart.key})`} strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
          {/* Cross-app cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "BTC Mined Today", value: "0.00142 BTC", sub: "≈ $95.72", icon: DollarSign },
              { label: "NiceHash Status", value: "Not Connected", sub: "Configure in pools", icon: WifiOff },
              { label: "Top Performer", value: "Rack-B-03", sub: "140.2 TH/s · 21.5 J/TH", icon: Activity },
              { label: "Worst Efficiency", value: "Rack-C-03", sub: "82.1 TH/s · 35.2 J/TH", icon: AlertTriangle },
            ].map(c => (
              <div key={c.label} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{c.label}</span><c.icon className="h-3 w-3 text-muted-foreground" /></div>
                <div className="text-sm font-mono font-semibold text-foreground">{c.value}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{c.sub}</div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Miners */}
        <TabsContent value="miners" className="space-y-4 mt-4">
          <BulkActionToolbar count={selectedIds.size} />
          <MinerTable miners={filteredMiners} onSelect={setSelectedMiner} selected={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll} />
        </TabsContent>

        {/* Alerts */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            {["all", "Critical", "Warning", "Info", "Active", "Resolved"].map(f => (
              <button key={f} onClick={() => setAlertFilter(f)} className={cn("px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors", alertFilter === f ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}>{f}</button>
            ))}
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-secondary/30">
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Time</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Miner</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Severity</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Type</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Description</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider">Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredAlerts.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.time}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground">{a.minerName}</TableCell>
                    <TableCell><span className={cn("text-[10px] font-mono uppercase font-semibold", a.severity === "Critical" ? "text-negative" : a.severity === "Warning" ? "text-[hsl(45,100%,50%)]" : "text-primary")}>{a.severity}</span></TableCell>
                    <TableCell className="font-mono text-xs text-foreground">{a.type}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">{a.description}</TableCell>
                    <TableCell><span className={cn("text-[10px] font-mono uppercase", a.status === "Active" ? "text-negative" : a.status === "Acknowledged" ? "text-[hsl(45,100%,50%)]" : "text-positive")}>{a.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Profiles */}
        <TabsContent value="profiles" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {minerProfiles.map(p => (
              <div key={p.id} className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-mono text-base font-semibold text-foreground">{p.name}</h3>
                <p className="text-xs font-mono text-muted-foreground mt-1 mb-4">{p.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div><span className="text-muted-foreground">Frequency:</span> <span className="text-foreground">{p.freqTarget} MHz</span></div>
                  <div><span className="text-muted-foreground">Fan:</span> <span className="text-foreground">{p.fanPolicy}</span></div>
                  <div><span className="text-muted-foreground">Hashrate:</span> <span className="text-foreground">~{p.expectedHashrate} TH/s</span></div>
                  <div><span className="text-muted-foreground">Power:</span> <span className="text-foreground">~{p.expectedPower}W</span></div>
                  <div><span className="text-muted-foreground">Thermal:</span> <span className="text-foreground">{p.thermalTarget}°C</span></div>
                  <div><span className="text-muted-foreground">Mode:</span> <span className="text-foreground">{p.powerMode}</span></div>
                </div>
                <Button variant="outline" size="sm" className="mt-4 w-full font-mono text-xs" disabled>Apply to Miners</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Pools */}
        <TabsContent value="pools" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {minerPools.map(p => (
              <div key={p.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-mono text-sm font-semibold text-foreground">{p.name}</h3>
                  <span className={cn("text-[10px] font-mono uppercase font-medium", p.health === "Connected" ? "text-positive" : p.health === "Degraded" ? "text-[hsl(45,100%,50%)]" : "text-negative")}>● {p.health}</span>
                </div>
                <div className="space-y-1 text-xs font-mono">
                  <div><span className="text-muted-foreground">URL:</span> <span className="text-foreground">{p.url}</span></div>
                  <div><span className="text-muted-foreground">Algorithm:</span> <span className="text-foreground">{p.algorithm}</span></div>
                  <div><span className="text-muted-foreground">Assigned:</span> <span className="text-foreground">{p.assignedMiners} miners</span></div>
                  <div><span className="text-muted-foreground">Priority:</span> <span className="text-foreground">{p.priority}</span></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" className="font-mono text-xs flex-1" disabled>Edit</Button>
                  <Button variant="outline" size="sm" className="font-mono text-xs flex-1" disabled>Test</Button>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" className="font-mono text-xs" disabled>+ Add Pool</Button>
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[
              { icon: Shield, title: "Firmware Status", desc: "8 of 10 miners on latest firmware v2024.03.1", action: "Schedule Update" },
              { icon: Clock, title: "Last Reboot", desc: "Most recent: Rack-C-02 — 1 minute ago", action: "View History" },
              { icon: Wrench, title: "Pending Tasks", desc: "2 miners flagged for service inspection", action: "View Tasks" },
              { icon: Thermometer, title: "Thermal Events", desc: "3 overheating events in the last 24h", action: "View Events" },
              { icon: Cpu, title: "Hardware Inspections", desc: "Next scheduled: 5 days", action: "Schedule" },
              { icon: Info, title: "Profile Changes", desc: "Last change: 3 days ago on Rack-A-02", action: "View Log" },
            ].map(w => (
              <div key={w.title} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-2"><w.icon className="h-4 w-4 text-muted-foreground" /><h3 className="font-mono text-sm font-semibold text-foreground">{w.title}</h3></div>
                <p className="text-xs font-mono text-muted-foreground mb-4">{w.desc}</p>
                <Button variant="outline" size="sm" className="font-mono text-xs w-full" disabled>{w.action}</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "Discovery Settings", items: [["Scan Range", "192.168.1.100–140"], ["Protocol", "CGMiner API"], ["Auto Discovery", true]] },
              { title: "Refresh & Telemetry", items: [["Refresh Interval", "30 seconds"], ["Telemetry Retention", "30 days"], ["Auto Refresh", true]] },
              { title: "Alert Configuration", items: [["Temp Threshold", "85°C"], ["Hashrate Drop %", "10%"], ["Alert Sounds", false], ["Auto-open Critical", true]] },
              { title: "Display Preferences", items: [["Default View", "Table"], ["Show Offline", true], ["Compact Mode", false], ["Group By", "Rack"]] },
            ].map(section => (
              <div key={section.title} className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-mono text-sm font-semibold text-foreground mb-4">{section.title}</h3>
                <div className="space-y-3">
                  {section.items.map(([label, val]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground">{String(label)}</span>
                      {typeof val === "boolean" ? (
                        <Switch defaultChecked={val} />
                      ) : (
                        <span className="text-xs font-mono text-foreground">{String(val)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {selectedMiner && <MinerDetailPanel miner={selectedMiner} onClose={() => setSelectedMiner(null)} />}
    </div>
  );
}
