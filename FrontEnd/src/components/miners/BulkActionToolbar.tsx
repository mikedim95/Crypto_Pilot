import { RotateCcw, Pause, Play, Zap, Server, Power } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BulkActionToolbar({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
      <span className="text-xs font-mono text-primary font-semibold">{count} selected</span>
      <div className="h-4 w-px bg-border mx-1" />
      {[
        { icon: Zap, label: "Apply Profile" },
        { icon: RotateCcw, label: "Reboot" },
        { icon: Pause, label: "Pause" },
        { icon: Play, label: "Resume" },
        { icon: Server, label: "Change Pool" },
        { icon: Power, label: "Power Mode" },
      ].map(a => (
        <Button key={a.label} variant="ghost" size="sm" className="h-7 px-2 text-[10px] font-mono gap-1" disabled>
          <a.icon className="h-3 w-3" />{a.label}
        </Button>
      ))}
    </div>
  );
}
