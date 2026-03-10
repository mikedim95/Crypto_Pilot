import { cn } from "@/lib/utils";
import type { MinerStatus } from "@/data/minerMockData";

const statusConfig: Record<MinerStatus, { bg: string; text: string; dot: string }> = {
  Online:       { bg: "bg-positive/10", text: "text-positive", dot: "bg-positive" },
  Offline:      { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  Rebooting:    { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary" },
  Warning:      { bg: "bg-[hsl(45_100%_50%/0.12)]", text: "text-[hsl(45,100%,50%)]", dot: "bg-[hsl(45,100%,50%)]" },
  Overheating:  { bg: "bg-negative/10", text: "text-negative", dot: "bg-negative" },
  "Low Hashrate": { bg: "bg-[hsl(45_100%_50%/0.12)]", text: "text-[hsl(45,100%,50%)]", dot: "bg-[hsl(45,100%,50%)]" },
};

export function MinerStatusBadge({ status }: { status: MinerStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider", cfg.bg, cfg.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot, status === "Online" && "animate-pulse")} />
      {status}
    </span>
  );
}
