import { useState } from "react";
import { cn } from "@/lib/utils";
import { MinerStatusBadge } from "./MinerStatusBadge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { LayoutGrid, List, Eye } from "lucide-react";
import type { Miner } from "@/data/minerMockData";

interface Props {
  miners: Miner[];
  onSelect: (m: Miner) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
}

export function MinerTable({ miners, onSelect, selected, onToggleSelect, onToggleAll }: Props) {
  const [view, setView] = useState<"table" | "grid">("table");

  if (view === "grid") {
    return (
      <div>
        <div className="flex justify-end mb-3 gap-1">
          <button onClick={() => setView("table")} className="p-1.5 rounded text-muted-foreground hover:text-foreground"><List className="h-4 w-4" /></button>
          <button onClick={() => setView("grid")} className="p-1.5 rounded bg-secondary text-foreground"><LayoutGrid className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {miners.map(m => (
            <div key={m.id} onClick={() => onSelect(m)} className="rounded-lg border border-border bg-card p-4 hover:bg-secondary/50 cursor-pointer transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-sm font-semibold text-foreground">{m.name}</span>
                <MinerStatusBadge status={m.status} />
              </div>
              <div className="text-xs font-mono text-muted-foreground mb-2">{m.model}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[10px] font-mono text-muted-foreground">Hashrate</div><div className="text-sm font-mono text-foreground">{m.hashrate} {m.hashrateUnit}</div></div>
                <div><div className="text-[10px] font-mono text-muted-foreground">Power</div><div className="text-sm font-mono text-foreground">{m.powerDraw}W</div></div>
                <div><div className="text-[10px] font-mono text-muted-foreground">Temp</div><div className="text-sm font-mono text-foreground">{Math.max(...m.chipTemps)}°C</div></div>
              </div>
              <div className="flex items-center justify-between mt-3 text-[10px] font-mono text-muted-foreground">
                <span>{m.ip}</span>
                <span>{m.pool}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-3 gap-1">
        <button onClick={() => setView("table")} className="p-1.5 rounded bg-secondary text-foreground"><List className="h-4 w-4" /></button>
        <button onClick={() => setView("grid")} className="p-1.5 rounded text-muted-foreground hover:text-foreground"><LayoutGrid className="h-4 w-4" /></button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/30">
              <TableHead className="w-10"><Checkbox checked={selected.size === miners.length && miners.length > 0} onCheckedChange={onToggleAll} /></TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Miner</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Model</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider text-right">Hashrate</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider text-right">Temp</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider text-right">Fan</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider text-right">Power</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider text-right">Efficiency</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Pool</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider">Uptime</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {miners.map(m => (
              <TableRow key={m.id} className="hover:bg-secondary/30 cursor-pointer transition-colors" onClick={() => onSelect(m)}>
                <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selected.has(m.id)} onCheckedChange={() => onToggleSelect(m.id)} /></TableCell>
                <TableCell className="font-mono text-xs font-semibold text-foreground">{m.name}<div className="text-[10px] text-muted-foreground">{m.ip}</div></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.model}</TableCell>
                <TableCell><MinerStatusBadge status={m.status} /></TableCell>
                <TableCell className={cn("font-mono text-xs text-right", m.hashrate > 0 ? "text-foreground" : "text-muted-foreground")}>{m.hashrate > 0 ? `${m.hashrate} ${m.hashrateUnit}` : "—"}</TableCell>
                <TableCell className={cn("font-mono text-xs text-right", Math.max(...m.chipTemps) > 90 ? "text-negative" : Math.max(...m.chipTemps) > 80 ? "text-[hsl(45,100%,50%)]" : "text-foreground")}>{Math.max(...m.chipTemps) > 0 ? `${Math.max(...m.chipTemps)}°C` : "—"}</TableCell>
                <TableCell className="font-mono text-xs text-right text-muted-foreground">{Math.max(...m.fanSpeeds) > 0 ? `${Math.max(...m.fanSpeeds)} RPM` : "—"}</TableCell>
                <TableCell className="font-mono text-xs text-right text-foreground">{m.powerDraw > 0 ? `${m.powerDraw}W` : "—"}</TableCell>
                <TableCell className="font-mono text-xs text-right text-muted-foreground">{m.efficiency > 0 ? `${m.efficiency} J/TH` : "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.pool}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.uptime || "—"}</TableCell>
                <TableCell><Eye className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
