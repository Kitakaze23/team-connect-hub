import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MessageSquare, UserCircle, Bell, Search, Terminal } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import TeamView from "@/components/team/TeamView";
import ChatView from "@/components/chat/ChatView";
import ProfileView from "@/components/profile/ProfileView";
import NotificationDropdown from "@/components/NotificationDropdown";
import GlobalSearch from "@/components/GlobalSearch";

type Tab = "team" | "chat" | "profile";

const tabConfig = [
  { id: "team" as Tab, label: "Команда", icon: Users },
  { id: "chat" as Tab, label: "Чат", icon: MessageSquare },
  { id: "profile" as Tab, label: "Профиль", icon: UserCircle },
];

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const isMobile = useIsMobile();

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <header className="shrink-0 h-14 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-4 gap-3 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Terminal className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-mono font-bold text-foreground text-lg hidden sm:inline">
            Терминал
          </span>
        </div>

        {/* Desktop tabs */}
        {!isMobile && (
          <nav className="flex gap-1 ml-6 bg-secondary rounded-lg p-1">
            {tabConfig.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <div className="flex-1" />

        <GlobalSearch />
        <NotificationDropdown />
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeTab === "team" && <TeamView />}
            {activeTab === "chat" && <ChatView />}
            {activeTab === "profile" && <ProfileView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Nav */}
      {isMobile && (
        <nav className="shrink-0 h-16 border-t border-border bg-card/90 backdrop-blur-md flex items-center justify-around px-2 z-20">
          {tabConfig.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-0.5 py-1 px-4 rounded-xl transition-all ${
                activeTab === tab.id
                  ? "text-accent"
                  : "text-muted-foreground"
              }`}
            >
              <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
};

export default Dashboard;
