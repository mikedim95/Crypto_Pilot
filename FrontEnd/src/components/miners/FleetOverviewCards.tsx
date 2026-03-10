import { Activity, Cpu, Power, Thermometer, AlertTriangle, DollarSign, Gauge, Wifi } from "lucide-react";
import { miners, minerAlerts } from "@/data/minerMockData";

const cards = () => {
  const online = miners.filter(m => m.status === "Online" || m.status === "Warning" || m.status === "Overheating" || m.status === "Low Hashrate");
  const offline = miners.filter(m => m.status === "Offline");
  const warnings = minerAlerts.filter(a => a.status === "Active").length;
  const totalHashrate = online.reduce((s, m) => s + (m.hashrateUnit === "TH/s" ? m.hashrate : 0), 0);
  const totalPower = online.reduce((s, m) => s + m.powerDraw, 0);
  const dailyRevenue = miners.reduce((s, m) => s + m.earningsEstimate, 0);
  const avgEff = online.filter(m => m.efficiency > 0).reduce((s, m, _, a) => s + m.efficiency / a.length, 0);
  const poolsConnected = new Set(online.map(m => m.pool)).size;

  return [
    { label: "Active Miners", value: `${online.length}`, sub: `of ${miners.length} total`, icon: Cpu, color: "text-positive" },
    { label: "Total Hashrate", value: `${totalHashrate.toFixed(1)} TH/s`, sub: "+2.1% vs yesterday", icon: Activity, color: "text-primary" },
    { label: "Total Power", value: `${(totalPower / 1000).toFixed(1)} kW`, sub: `${totalPower.toLocaleString()} W`, icon: Power, color: "text-foreground" },
    { label: "Online / Offline", value: `${online.length} / ${offline.length}`, sub: offline.length > 0 ? `${offline.length} needs attention` : "All operational", icon: Wifi, color: offline.length > 0 ? "text-negative" : "text-positive" },
    { label: "Active Warnings", value: `${warnings}`, sub: warnings > 0 ? "Check alerts" : "No issues", icon: AlertTriangle, color: warnings > 0 ? "text-[hsl(45,100%,50%)]" : "text-positive" },
    { label: "Est. Daily Revenue", value: `$${dailyRevenue.toFixed(2)}`, sub: "All miners combined", icon: DollarSign, color: "text-positive" },
    { label: "Avg Efficiency", value: `${avgEff.toFixed(1)} J/TH`, sub: "Online SHA-256 miners", icon: Gauge, color: "text-primary" },
    { label: "Pools Connected", value: `${poolsConnected}`, sub: `${poolsConnected} active pools`, icon: Wifi, color: "text-primary" },
  ];
};

export function FleetOverviewCards() {
  const data = cards();
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {data.map((c) => (
        <div key={c.label} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{c.label}</span>
            <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
          </div>
          <div className={`text-xl font-mono font-semibold ${c.color}`}>{c.value}</div>
          <div className="text-[11px] font-mono text-muted-foreground mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
