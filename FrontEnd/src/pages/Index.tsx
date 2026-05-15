import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SettingsModal } from "@/components/SettingsModal";
import { TopBar } from "@/components/TopBar";
import { ProfileModal } from "@/components/ProfileModal";
import { AsicMinersPage } from "@/pages/AsicMinersPage";
import type { AppSession, PortfolioAccountType } from "@/types/api";

interface IndexProps {
  session: AppSession;
  onLogout: () => void;
}

const Index = ({ session, onLogout }: IndexProps) => {
  const [currentPage, setCurrentPage] = useState("asic-miners");
  const [accountType, setAccountType] = useState<PortfolioAccountType>("demo");
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleNavigate = (page: string) => {
    if (page === "asic-miners") {
      setCurrentPage(page);
    }
  };

  const renderPage = () => {
    return <AsicMinersPage />;
  };

  return (
    <div data-account-mode={accountType} className="app-shell flex h-screen bg-background overflow-hidden">
      <AppSidebar currentPage={currentPage} onNavigate={handleNavigate} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          accountType={accountType}
          onAccountTypeChange={setAccountType}
          session={session}
          onLogout={onLogout}
          onProfileOpen={() => setProfileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <div key={currentPage} className="page-enter">
            {renderPage()}
          </div>
        </main>
      </div>
      <ProfileModal
        session={session}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onLogout={onLogout}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default Index;
