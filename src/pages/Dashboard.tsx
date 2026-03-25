import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MessageSquare, UserCircle, Terminal, Settings, LayoutList } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import TeamView from "@/components/team/TeamView";
import ChatView from "@/components/chat/ChatView";
import ProfileView from "@/components/profile/ProfileView";
import BacklogView from "@/components/backlog/BacklogView";
import NotificationDropdown from "@/components/NotificationDropdown";
import GlobalSearch from "@/components/GlobalSearch";
import CompanySettings from "@/components/company/CompanySettings";

type Tab = "team" | "chat" | "profile" | "settings" | "backlog";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem("dashboard-active-tab");
    return (saved && ["team", "chat", "profile", "settings", "backlog"].includes(saved)) ? saved as Tab : "chat";
  });

  const handleSetTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem("dashboard-active-tab", tab);
  }, []);
  const isMobile = useIsMobile();
  const { membership } = useAuth();
  const [backlogEnabled, setBacklogEnabled] = useState(true);

  const isAdmin = membership?.role === "admin";

  // Request notification permission for call alerts
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!membership?.company_id) return;
    supabase.from("companies").select("backlog_enabled").eq("id", membership.company_id).single().then(({ data }) => {
      if (data) setBacklogEnabled(data.backlog_enabled);
    });
  }, [membership?.company_id]);

  const tabConfig = [
    { id: "team" as Tab, label: "Команда", icon: Users },
    { id: "chat" as Tab, label: "Чат", icon: MessageSquare },
    ...(backlogEnabled ? [{ id: "backlog" as Tab, label: "Бэклог", icon: LayoutList }] : []),
    { id: "profile" as Tab, label: "Профиль", icon: UserCircle },
    ...(isAdmin ? [{ id: "settings" as Tab, label: "Настройки", icon: Settings }] : []),
  ];

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <header className="shrink-0 h-14 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-4 gap-3 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Terminal className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-mono font-bold text-foreground text-lg hidden sm:inline">
            {membership?.company_name || "Терминал"}
          </span>
        </div>

        {/* Desktop tabs */}
        {!isMobile && (
          <nav className="flex gap-1 ml-6 bg-secondary rounded-lg p-1">
            {tabConfig.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleSetTab(tab.id)}
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="h-full"
          >
            {activeTab === "team" && <TeamView />}
            {activeTab === "chat" && <ChatView />}
            {activeTab === "backlog" && <BacklogView />}
            {activeTab === "profile" && <ProfileView />}
            {activeTab === "settings" && isAdmin && <CompanySettings />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Nav */}
      {isMobile && (
        <nav className="shrink-0 h-16 border-t border-border bg-card/90 backdrop-blur-md flex items-center justify-around px-2 z-20">
          {tabConfig.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleSetTab(tab.id)}
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
