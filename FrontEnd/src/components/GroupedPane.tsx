import { useEffect } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GroupedPaneTab<T extends string = string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface GroupedPaneProps<T extends string = string> {
  title: string;
  description: string;
  tabs: GroupedPaneTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  children: ReactNode;
}

export function GroupedPane<T extends string = string>({
  title,
  description,
  tabs,
  activeTab,
  onTabChange,
  children,
}: GroupedPaneProps<T>) {
  useEffect(() => {
    const scrollContainer = document.querySelector("main");
    if (!(scrollContainer instanceof HTMLElement)) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollContainer.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [activeTab]);

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-20 border-b border-border bg-background/75 backdrop-blur-xl">
        <div className="px-4 pb-4 pt-4 md:px-6">
          <div className="rounded-2xl border border-border bg-[linear-gradient(180deg,_hsl(var(--card))_0%,_hsl(var(--secondary)/0.55)_100%)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">{title}</div>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
              </div>
              <div className="rounded-full border border-border bg-secondary/35 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground">
                {tabs.length} views
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.id === activeTab;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-mono uppercase tracking-[0.18em] transition-all duration-300",
                      active
                        ? "border-primary/40 bg-primary/10 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.14)]"
                        : "border-border bg-secondary/20 text-muted-foreground hover:border-primary/25 hover:bg-secondary/40 hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div key={activeTab} className="tab-panel-enter">
        {children}
      </div>
    </div>
  );
}
