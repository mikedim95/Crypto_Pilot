import { Lock } from "lucide-react";
import { automationFeatures } from "@/data/mockData";

export function AutomationPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-mono font-semibold text-foreground">Automation</h2>
        <p className="text-sm text-muted-foreground mt-1">Automated trading and portfolio management tools.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {automationFeatures.map((f) => (
          <div key={f.title} className="bg-card border border-border rounded-lg p-6 relative overflow-hidden opacity-60">
            <div className="absolute top-4 right-4">
              <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded">
                <Lock className="h-3 w-3" />
                Coming Soon
              </span>
            </div>
            <div className="text-sm font-mono font-semibold text-foreground mb-2">{f.title}</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
