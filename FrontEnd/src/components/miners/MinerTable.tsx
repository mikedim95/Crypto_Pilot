import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MinerStatusBadge } from "./MinerStatusBadge";
import type { MinerEntity, MinerLiveData } from "@/types/api";

type MinerCommand = "restart" | "reboot" | "start" | "stop" | "pause" | "resume";

interface MinerTableProps {
  miners: MinerEntity[];
  fleetLive: MinerLiveData[];
  isLoading?: boolean;
  selectedMinerIds: number[];
  allSelected: boolean;
  someSelected: boolean;
  onOpen: (minerId: number) => void;
  onToggleMiner: (minerId: number, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onVerify: (minerId: number) => void;
  onCommand: (minerId: number, action: MinerCommand) => void;
}

function formatLastSeen(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleString();
}

function getLiveMap(fleetLive: MinerLiveData[]): Map<number, MinerLiveData> {
  return new Map(fleetLive.map((miner) => [miner.minerId, miner]));
}

function getMinerSnapshot(miner: MinerEntity, live: MinerLiveData | undefined) {
  const maxBoard = live?.boardTemps.length ? Math.max(...live.boardTemps) : null;
  const maxHotspot = live?.hotspotTemps.length ? Math.max(...live.hotspotTemps) : null;
  const activePool = live?.pools.find((pool, index) => live.poolActiveIndex === index) ?? live?.pools[0];

  return {
    maxBoard,
    maxHotspot,
    activePool,
    rate: typeof live?.totalRateThs === "number" ? `${live.totalRateThs.toFixed(2)} TH/s` : "--",
    fan: typeof live?.fanPwm === "number" ? `${live.fanPwm}%` : "--",
    preset: live?.presetPretty ?? live?.presetName ?? "--",
    lastSeen: formatLastSeen(live?.lastSeenAt ?? miner.lastSeenAt),
  };
}

function MinerActionMenu({
  minerId,
  onOpen,
  onVerify,
  onCommand,
}: {
  minerId: number;
  onOpen: (minerId: number) => void;
  onVerify: (minerId: number) => void;
  onCommand: (minerId: number, action: MinerCommand) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onOpen(minerId)}>Open details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onVerify(minerId)}>Verify</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCommand(minerId, "restart")}>Restart mining</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCommand(minerId, "reboot")}>Reboot</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCommand(minerId, "stop")}>Stop</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCommand(minerId, "start")}>Start</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCommand(minerId, "pause")}>Pause</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCommand(minerId, "resume")}>Resume</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-background/45 px-2.5 py-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-foreground">{value}</div>
    </div>
  );
}

export function MinerTable({
  miners,
  fleetLive,
  isLoading = false,
  selectedMinerIds,
  allSelected,
  someSelected,
  onOpen,
  onToggleMiner,
  onToggleAll,
  onVerify,
  onCommand,
}: MinerTableProps) {
  const liveMap = getLiveMap(fleetLive);
  const selectedMinerIdSet = new Set(selectedMinerIds);

  return (
    <>
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={`miner-mobile-skeleton-${index}`} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-5 w-5 rounded" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3 w-44" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((__, metricIndex) => (
                  <Skeleton key={`miner-mobile-skeleton-${index}-${metricIndex}`} className="h-14 rounded-md" />
                ))}
              </div>
            </div>
          ))
        ) : miners.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-card/70 px-4 py-8 text-center text-sm font-mono text-muted-foreground">
            No miners saved yet.
          </div>
        ) : (
          miners.map((miner) => {
            const live = liveMap.get(miner.id);
            const snapshot = getMinerSnapshot(miner, live);
            const isSelected = selectedMinerIdSet.has(miner.id);

            return (
              <div
                key={miner.id}
                role="button"
                tabIndex={0}
                data-state={isSelected ? "selected" : undefined}
                className={cn(
                  "cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:bg-secondary/35",
                  isSelected ? "border-primary/45 bg-primary/5" : "border-border"
                )}
                onClick={() => onOpen(miner.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(miner.id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      aria-label={`Select miner ${miner.name}`}
                      onCheckedChange={(checked) => onToggleMiner(miner.id, checked === true)}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm font-semibold text-foreground">{miner.name}</div>
                        <div className="mt-1 truncate text-xs font-mono text-muted-foreground">
                          {miner.model ?? "Unknown model"}
                          {miner.firmware ? ` | ${miner.firmware}` : ""}
                        </div>
                      </div>
                      <MinerStatusBadge online={live?.online ?? false} minerState={live?.minerState} />
                    </div>
                  </div>

                  <div onClick={(event) => event.stopPropagation()}>
                    <MinerActionMenu minerId={miner.id} onOpen={onOpen} onVerify={onVerify} onCommand={onCommand} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MobileMetric label="IP" value={miner.ip} />
                  <MobileMetric label="Rate" value={snapshot.rate} />
                  <MobileMetric label="Board" value={snapshot.maxBoard !== null ? `${snapshot.maxBoard}C` : "--"} />
                  <MobileMetric label="Hotspot" value={snapshot.maxHotspot !== null ? `${snapshot.maxHotspot}C` : "--"} />
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MobileMetric label="Fan" value={snapshot.fan} />
                  <MobileMetric label="Last Seen" value={snapshot.lastSeen} />
                </div>

                <div className="mt-2 min-w-0 rounded-md border border-border/70 bg-background/45 px-2.5 py-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Preset</div>
                  <div className="mt-1 truncate font-mono text-sm text-foreground">{snapshot.preset}</div>
                  <div className="mt-1 truncate text-[11px] font-mono text-muted-foreground">{snapshot.activePool?.url ?? "--"}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-secondary/30">
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  aria-label="Select all miners"
                  onCheckedChange={(checked) => onToggleAll(checked === true)}
                />
              </TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider">Miner</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider">IP</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider">Status</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-right">Rate</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-right">Max Board</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-right hidden md:table-cell">Hotspot</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider text-right hidden md:table-cell">Fan</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider hidden lg:table-cell">Preset</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider hidden lg:table-cell">Pool</TableHead>
              <TableHead className="font-mono text-[11px] uppercase tracking-wider hidden xl:table-cell">Last Seen</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <TableRow key={`miner-skeleton-${rowIndex}`}>
                  {Array.from({ length: 12 }).map((__, cellIndex) => (
                    <TableCell key={`miner-skeleton-${rowIndex}-${cellIndex}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : miners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="h-24 text-center font-mono text-sm text-muted-foreground">
                  No miners saved yet.
                </TableCell>
              </TableRow>
            ) : (
              miners.map((miner) => {
                const live = liveMap.get(miner.id);
                const snapshot = getMinerSnapshot(miner, live);
                const isSelected = selectedMinerIdSet.has(miner.id);

                return (
                  <TableRow
                    key={miner.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="cursor-pointer transition-colors duration-200 hover:bg-secondary/40"
                    onClick={() => onOpen(miner.id)}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        aria-label={`Select miner ${miner.name}`}
                        onCheckedChange={(checked) => onToggleMiner(miner.id, checked === true)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm font-semibold text-foreground">{miner.name}</div>
                      <div className="mt-1 text-xs font-mono text-muted-foreground">
                        {miner.model ?? "Unknown model"}
                        {miner.firmware ? ` | ${miner.firmware}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{miner.ip}</TableCell>
                    <TableCell>
                      <MinerStatusBadge online={live?.online ?? false} minerState={live?.minerState} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-foreground">{snapshot.rate}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-foreground">
                      {snapshot.maxBoard !== null ? `${snapshot.maxBoard}C` : "--"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-foreground hidden md:table-cell">
                      {snapshot.maxHotspot !== null ? `${snapshot.maxHotspot}C` : "--"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-foreground hidden md:table-cell">{snapshot.fan}</TableCell>
                    <TableCell className="font-mono text-sm text-foreground hidden lg:table-cell">{snapshot.preset}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">
                      {snapshot.activePool?.url ?? "--"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground hidden xl:table-cell">{snapshot.lastSeen}</TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <MinerActionMenu minerId={miner.id} onOpen={onOpen} onVerify={onVerify} onCommand={onCommand} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
