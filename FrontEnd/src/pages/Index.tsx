import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { ContextPanel } from "@/components/ContextPanel";
import { DashboardPage } from "@/pages/DashboardPage";
import { PortfolioPage } from "@/pages/PortfolioPage";
import { MarketsPage } from "@/pages/MarketsPage";
import { RebalancePage } from "@/pages/RebalancePage";
import { AutomationPage } from "@/pages/AutomationPage";
import { AsicMinersPage } from "@/pages/AsicMinersPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { Asset } from "@/data/mockData";

const Index = () => {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard": return <DashboardPage onSelectAsset={setSelectedAsset} />;
      case "portfolio": return <PortfolioPage onSelectAsset={setSelectedAsset} />;
      case "markets": return <MarketsPage onSelectAsset={setSelectedAsset} />;
      case "rebalance": return <RebalancePage />;
      case "automation": return <AutomationPage />;
      case "asic-miners": return <AsicMinersPage />;
      case "orders": return <OrdersPage />;
      case "settings": return <SettingsPage />;
      default: return <DashboardPage onSelectAsset={setSelectedAsset} />;
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
      <ContextPanel asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
    </div>
  );
};

export default Index;
