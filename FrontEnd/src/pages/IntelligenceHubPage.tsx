import { ActivitySquare, BrainCircuit, Newspaper } from "lucide-react";
import { GroupedPane, type GroupedPaneTab } from "@/components/GroupedPane";
import { BtcNewsInsightsPage } from "@/pages/BtcNewsInsightsPage";
import { DecisionIntelligencePage } from "@/pages/DecisionIntelligencePage";
import { SignalReviewPage } from "@/pages/SignalReviewPage";
import type { PortfolioAccountType } from "@/types/api";

export type IntelligenceHubTab = "decision-intelligence" | "signal-review" | "btc-news";

interface IntelligenceHubPageProps {
  accountType: PortfolioAccountType;
  activeTab: IntelligenceHubTab;
  onTabChange: (tab: IntelligenceHubTab) => void;
}

const INTELLIGENCE_TABS: GroupedPaneTab<IntelligenceHubTab>[] = [
  { id: "decision-intelligence", label: "Decision", icon: BrainCircuit },
  { id: "signal-review", label: "Signals", icon: ActivitySquare },
  { id: "btc-news", label: "BTC News", icon: Newspaper },
];

export function IntelligenceHubPage({ accountType, activeTab, onTabChange }: IntelligenceHubPageProps) {
  return (
    <GroupedPane
      title="Intelligence"
      description="Decision context, reviewed signals, and BTC news now sit together so the research flow feels like one panel instead of three disconnected pages."
      tabs={INTELLIGENCE_TABS}
      activeTab={activeTab}
      onTabChange={onTabChange}
    >
      {activeTab === "decision-intelligence" ? (
        <DecisionIntelligencePage accountType={accountType} />
      ) : activeTab === "signal-review" ? (
        <SignalReviewPage accountType={accountType} />
      ) : (
        <BtcNewsInsightsPage />
      )}
    </GroupedPane>
  );
}
