import { Play, Power, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BulkMinerAction = "restart" | "reboot" | "start" | "stop";

interface BulkActionToolbarProps {
  count: number;
  isPending?: boolean;
  onAction: (action: BulkMinerAction) => void;
  onClear: () => void;
}

const bulkActions: { action: BulkMinerAction; icon: typeof RotateCcw; label: string }[] = [
  { action: "restart", icon: RotateCcw, label: "Restart" },
  { action: "reboot", icon: Power, label: "Reboot" },
  { action: "start", icon: Play, label: "Start" },
  { action: "stop", icon: Square, label: "Stop" },
];

export function BulkActionToolbar({ count, isPending = false, onAction, onClear }: BulkActionToolbarProps) {
  if (count === 0) return null;

  return (
    <div className="grid w-full grid-cols-2 gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:px-4 sm:py-2">
      <span className="col-span-2 text-xs font-mono font-semibold text-primary sm:col-span-1">{count} selected</span>
      <div className="mx-1 hidden h-4 w-px bg-border sm:block" />
      {bulkActions.map(({ action, icon: Icon, label }) => (
        <Button
          key={action}
          variant="ghost"
          size="sm"
          className="h-8 justify-center gap-1 px-2 font-mono text-[11px]"
          disabled={isPending}
          onClick={() => onAction(action)}
        >
          <Icon className="h-3 w-3" />
          {label}
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="col-span-2 h-8 justify-center gap-1 px-2 font-mono text-[11px] sm:col-span-1 sm:ml-auto"
        disabled={isPending}
        onClick={onClear}
      >
        <X className="h-3 w-3" />
        Clear
      </Button>
    </div>
  );
}
