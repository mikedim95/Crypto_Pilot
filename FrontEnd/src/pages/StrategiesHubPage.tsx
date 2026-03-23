import { Bot, RefreshCw } from "lucide-react";
import { GroupedPane, type GroupedPaneTab } from "@/components/GroupedPane";
import { AutomationPage } from "@/pages/AutomationPage";
import { BotsPage } from "@/pages/BotsPage";
import type { PortfolioAccountType } from "@/types/api";

export type StrategiesHubTab = "bots" | "automation";

interface StrategiesHubPageProps {
  accountType: PortfolioAccountType;
  activeTab: StrategiesHubTab;
  onTabChange: (tab: StrategiesHubTab) => void;
}

const STRATEGIES_TABS: GroupedPaneTab<StrategiesHubTab>[] = [
  { id: "bots", label: "Bots", icon: RefreshCw },
  { id: "automation", label: "Strategies", icon: Bot },
];

export function StrategiesHubPage({ accountType, activeTab, onTabChange }: StrategiesHubPageProps) {
  return (
    <GroupedPane
      title="Strategies"
      description="Bots and strategies now live in one lane. Bots manage capital buckets and execution rules, while strategies handle logic, scoring, and backtests."
      tabs={STRATEGIES_TABS}
      activeTab={activeTab}
      onTabChange={onTabChange}
    >
      {activeTab === "bots" ? <BotsPage accountType={accountType} /> : <AutomationPage accountType={accountType} />}
    </GroupedPane>
  );
}
