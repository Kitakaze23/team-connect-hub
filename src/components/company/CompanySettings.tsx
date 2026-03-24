import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Users, Copy, Check, UserPlus, UserMinus, Shield, ShieldOff, Loader2, Timer, LayoutList, MessageSquare, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import TeamManagement from "./TeamManagement";
import DeskManagement from "./DeskManagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

interface Member {
  id: string;
  user_id: string;
  status: string;
  role: string;
  created_at: string;
  profile?: { first_name: string; last_name: string; position: string | null };
  email?: string;
}

interface ChatConversation {
  id: string;
  name: string | null;
  type: string;
}

type SettingsSection = "company" | "members" | "sprint" | "teams" | "desks" | "backlog" | "chats";

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Building2 }[] = [
  { id: "company", label: "Компания", icon: Building2 },
  { id: "members", label: "Участники", icon: Users },
  { id: "sprint", label: "Спринт", icon: Timer },
  { id: "teams", label: "Команды", icon: Users },
  { id: "desks", label: "Рассадка", icon: LayoutList },
  { id: "backlog", label: "Бэклог", icon: LayoutList },
  { id: "chats", label: "Чаты", icon: MessageSquare },
];

const CompanySettings = () => {
  const { membership, user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState<SettingsSection>("company");
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [sprintLengthDays, setSprintLengthDays] = useState(14);
  const [sprintStartDate, setSprintStartDate] = useState("");
  const [backlogEnabled, setBacklogEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);

  const companyId = membership?.company_id;

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);

    const { data: company } = await supabase
      .from("companies")
      .select("name, invite_code, sprint_length_days, sprint_start_date, backlog_enabled")
      .eq("id", companyId)
      .single();

    if (company) {
      setCompanyName(company.name);
      setInviteCode(company.invite_code || "");
      setSprintLengthDays(company.sprint_length_days || 14);
      setSprintStartDate(company.sprint_start_date || "");
      setBacklogEnabled(company.backlog_enabled !== false);
    }

    const { data: allMembers } = await supabase
      .from("company_members")
      .select("id, user_id, status, role, created_at")
      .eq("company_id", companyId);

    if (allMembers) {
      const userIds = allMembers.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, position")
        .in("user_id", userIds);

      const enriched = allMembers.map(m => ({
        ...m,
        profile: profiles?.find(p => p.user_id === m.user_id),
      }));

      setMembers(enriched.filter(m => m.status === "approved"));
      setPendingMembers(enriched.filter(m => m.status === "pending"));
    }

    setLoading(false);
  };

  const fetchChats = async () => {
    if (!companyId) return;
    setChatsLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select("id, name, type")
      .eq("company_id", companyId)
      .order("created_at");
    setChats(data || []);
    setChatsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  useEffect(() => {
    if (activeSection === "chats") fetchChats();
  }, [activeSection, companyId]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel("company-members-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "company_members", filter: `company_id=eq.${companyId}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const handleSaveName = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase.from("companies").update({ name: companyName.trim() }).eq("id", companyId);
    if (error) toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    else toast({ title: "Сохранено" });
    setSaving(false);
  };

  const handleSaveSprint = async () => {
    if (!companyId) return;
    setSaving(true);
    const updates: any = { sprint_length_days: sprintLengthDays };
    if (sprintStartDate) updates.sprint_start_date = sprintStartDate;
    const { error } = await supabase.from("companies").update(updates).eq("id", companyId);
    if (error) toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    else toast({ title: "Настройки спринта сохранены" });
    setSaving(false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = async (memberId: string, userId: string) => {
    const { error } = await supabase.from("company_members").update({ status: "approved" }).eq("id", memberId);
    if (!error) {
      await supabase.from("profiles").update({ company_id: companyId }).eq("user_id", userId);
      toast({ title: "Пользователь одобрен" });
      fetchData();
    }
  };

  const handleReject = async (memberId: string) => {
    const { error } = await supabase.from("company_members").update({ status: "rejected" }).eq("id", memberId);
    if (!error) { toast({ title: "Запрос отклонён" }); fetchData(); }
  };

  const handleToggleRole = async (memberId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    const { error } = await supabase.from("company_members").update({ role: newRole }).eq("id", memberId);
    if (!error) { toast({ title: `Роль изменена на ${newRole === "admin" ? "Администратор" : "Пользователь"}` }); fetchData(); }
  };

  const handleRemoveMember = async (memberId: string, userId: string) => {
    const { error } = await supabase.from("company_members").delete().eq("id", memberId);
    if (!error) {
      await supabase.from("profiles").update({ company_id: null }).eq("user_id", userId);
      toast({ title: "Пользователь удалён из компании" });
      fetchData();
    }
  };

  const handleClearChat = async (conversationId: string) => {
    const { error } = await supabase.from("messages").delete().eq("conversation_id", conversationId);
    if (error) toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    else toast({ title: "Чат очищен" });
  };

  const getChatLabel = (chat: ChatConversation) => {
    if (chat.type === "general") return "Общий чат";
    return chat.name || (chat.type === "direct" ? "Личный диалог" : "Группа");
  };

  const getChatTypeLabel = (type: string) => {
    if (type === "general") return "Общий";
    if (type === "direct") return "Личный";
    return "Группа";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderCompanySection = () => (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Настройки компании
        </h3>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Название</Label>
          <div className="flex gap-2">
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-9 bg-secondary/50" />
            <Button size="sm" onClick={handleSaveName} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Сохранить"}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Код приглашения</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-secondary text-sm font-mono text-foreground">{inviteCode}</code>
            <Button size="sm" variant="outline" onClick={handleCopyCode}>
              {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
          <Timer className="w-4 h-4" /> Настройки спринта
        </h3>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Размер спринта (дни)</Label>
          <Input type="number" min={1} value={sprintLengthDays} onChange={(e) => setSprintLengthDays(Number(e.target.value) || 14)} className="h-9 bg-secondary/50 w-32" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Дата начала первого спринта</Label>
          <Input type="date" value={sprintStartDate} onChange={(e) => setSprintStartDate(e.target.value)} className="h-9 bg-secondary/50 w-48" />
        </div>
        <Button size="sm" onClick={handleSaveSprint} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Сохранить"}
        </Button>
      </motion.div>

      <TeamManagement />
      <DeskManagement />
    </div>
  );

  const renderMembersSection = () => (
    <div className="space-y-4">
      {pendingMembers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Запросы на вступление
            <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">{pendingMembers.length}</span>
          </h3>
          {pendingMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold">
                {(m.profile?.first_name?.[0] || "?")}{(m.profile?.last_name?.[0] || "")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{m.profile?.last_name || "—"} {m.profile?.first_name || ""}</p>
                <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString("ru")}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={() => handleApprove(m.id, m.user_id)} className="bg-accent text-accent-foreground hover:bg-accent/90 h-8 px-3 text-xs">Одобрить</Button>
                <Button size="sm" variant="ghost" onClick={() => handleReject(m.id)} className="text-destructive h-8 px-3 text-xs">Отклонить</Button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4" /> Участники ({members.length})
        </h3>
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
            <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold">
              {(m.profile?.first_name?.[0] || "?")}{(m.profile?.last_name?.[0] || "")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{m.profile?.last_name || "—"} {m.profile?.first_name || ""}</p>
              <p className="text-xs text-muted-foreground">{m.profile?.position || "—"} · {m.role === "admin" ? "Администратор" : "Пользователь"}</p>
            </div>
            {m.user_id !== user?.id && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => handleToggleRole(m.id, m.role)} className="h-8 px-2" title={m.role === "admin" ? "Снять права администратора" : "Назначить администратором"}>
                  {m.role === "admin" ? <ShieldOff className="w-4 h-4 text-muted-foreground" /> : <Shield className="w-4 h-4 text-accent" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" title="Удалить из компании">
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить сотрудника?</AlertDialogTitle>
                      <AlertDialogDescription>{m.profile?.first_name} {m.profile?.last_name} будет удалён из компании.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRemoveMember(m.id, m.user_id)}>Удалить</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );

  const renderBacklogSection = () => (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
          <LayoutList className="w-4 h-4" /> Бэклог
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Вкладка «Бэклог»</p>
            <p className="text-xs text-muted-foreground">Показывать вкладку бэклога для всех участников</p>
          </div>
          <button
            onClick={async () => {
              const next = !backlogEnabled;
              setBacklogEnabled(next);
              await supabase.from("companies").update({ backlog_enabled: next }).eq("id", companyId);
              toast({ title: next ? "Бэклог включён" : "Бэклог отключён" });
            }}
            className={`w-11 h-6 rounded-full transition-colors relative ${backlogEnabled ? "bg-accent" : "bg-secondary"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${backlogEnabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </motion.div>
    </div>
  );

  const renderChatsSection = () => (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Управление чатами
        </h3>
        <p className="text-xs text-muted-foreground">Очистка удаляет все сообщения в выбранном чате.</p>
        {chatsLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
        ) : chats.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Нет чатов</p>
        ) : (
          chats.map((chat) => (
            <div key={chat.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{getChatLabel(chat)}</p>
                <p className="text-xs text-muted-foreground">{getChatTypeLabel(chat.type)}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" title="Очистить чат">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Очистить чат?</AlertDialogTitle>
                    <AlertDialogDescription>Все сообщения в «{getChatLabel(chat)}» будут удалены безвозвратно.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleClearChat(chat.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Очистить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </motion.div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "company": return renderCompanySection();
      case "members": return renderMembersSection();
      case "backlog": return renderBacklogSection();
      case "chats": return renderChatsSection();
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left sidebar menu */}
      <div className={`shrink-0 border-r border-border bg-card/50 overflow-y-auto ${isMobile ? "w-12" : "w-48"}`}>
        <nav className="p-2 space-y-1">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2.5 w-full rounded-lg transition-all ${
                isMobile ? "p-2.5 justify-center" : "px-3 py-2.5"
              } ${
                activeSection === section.id
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
              title={section.label}
            >
              <section.icon className="w-4 h-4 shrink-0" />
              {!isMobile && <span className="text-sm">{section.label}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 pb-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default CompanySettings;
