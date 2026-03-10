import type { Asset } from "@/types/api";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
}

export function Sparkline({ data, positive, width = 80, height = 28 }: SparklineProps) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const color = positive ? "hsl(168, 100%, 48%)" : "hsl(340, 100%, 62%)";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

interface AssetRowProps {
  asset: Asset;
  onClick?: () => void;
}

export function AssetRow({ asset, onClick }: AssetRowProps) {
  const positive = asset.change24h >= 0;
  const fmt = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border cursor-pointer transition-colors group",
        positive ? "hover:animate-pulse-positive" : "hover:animate-pulse-negative"
      )}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center">
            <span className="text-xs font-mono font-semibold text-foreground">{asset.symbol.slice(0, 2)}</span>
          </div>
          <div>
            <div className="text-sm font-mono font-medium text-foreground">{asset.symbol}</div>
            <div className="text-[11px] text-muted-foreground">{asset.name}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-right font-mono text-sm text-foreground">{fmt(asset.price)}</td>
      <td className="py-3 px-4 text-right font-mono text-sm text-foreground">
        {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </td>
      <td className="py-3 px-4 text-right font-mono text-sm text-foreground">{fmt(asset.value)}</td>
      <td className="py-3 px-4 text-right font-mono text-sm text-muted-foreground">{asset.allocation}%</td>
      <td className={cn("py-3 px-4 text-right font-mono text-sm", positive ? "text-positive" : "text-negative")}>
        {positive ? "+" : ""}{asset.change24h}%
      </td>
      <td className="py-3 px-4">
        <div className="flex justify-end">
          <Sparkline data={asset.sparkline} positive={positive} />
        </div>
      </td>
    </tr>
  );
}
