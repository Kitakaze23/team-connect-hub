import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Users, Copy, Check, UserPlus, UserMinus, Shield, ShieldOff, Loader2 } from "lucide-react";
import TeamManagement from "./TeamManagement";
import DeskManagement from "./DeskManagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Member {
  id: string;
  user_id: string;
  status: string;
  role: string;
  created_at: string;
  profile?: { first_name: string; last_name: string; position: string | null };
  email?: string;
}

const CompanySettings = () => {
  const { membership, user } = useAuth();
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [sprintLengthDays, setSprintLengthDays] = useState(14);
  const [sprintStartDate, setSprintStartDate] = useState("");
  const [saving, setSaving] = useState(false);

  const companyId = membership?.company_id;

  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);

    // Fetch company
    const { data: company } = await supabase
      .from("companies")
      .select("name, invite_code, sprint_length_days, sprint_start_date")
      .eq("id", companyId)
      .single();

    if (company) {
      setCompanyName(company.name);
      setInviteCode(company.invite_code || "");
      setSprintLengthDays(company.sprint_length_days || 14);
      setSprintStartDate(company.sprint_start_date || "");
    }

    // Fetch members
    const { data: allMembers } = await supabase
      .from("company_members")
      .select("id, user_id, status, role, created_at")
      .eq("company_id", companyId);

    if (allMembers) {
      // Fetch profiles for all members
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

  useEffect(() => {
    fetchData();
  }, [companyId]);

  // Realtime updates
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
    const { error } = await supabase
      .from("company_members")
      .update({ status: "approved" })
      .eq("id", memberId);

    if (!error) {
      // Update profile company_id
      await supabase.from("profiles").update({ company_id: companyId }).eq("user_id", userId);
      toast({ title: "Пользователь одобрен" });
      fetchData();
    }
  };

  const handleReject = async (memberId: string) => {
    const { error } = await supabase
      .from("company_members")
      .update({ status: "rejected" })
      .eq("id", memberId);
    if (!error) { toast({ title: "Запрос отклонён" }); fetchData(); }
  };

  const handleToggleRole = async (memberId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    const { error } = await supabase
      .from("company_members")
      .update({ role: newRole })
      .eq("id", memberId);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8">
        {/* Company info */}
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

        {/* Pending requests */}
        {pendingMembers.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Запросы на вступление
              <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">{pendingMembers.length}</span>
            </h3>
            {pendingMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold">
                  {(m.profile?.first_name?.[0] || "?")}
                  {(m.profile?.last_name?.[0] || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.profile?.last_name || "—"} {m.profile?.first_name || ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("ru")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => handleApprove(m.id, m.user_id)} className="bg-accent text-accent-foreground hover:bg-accent/90 h-8 px-3 text-xs">
                    Одобрить
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleReject(m.id)} className="text-destructive h-8 px-3 text-xs">
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Active members */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4" /> Участники ({members.length})
          </h3>
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30">
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold">
                {(m.profile?.first_name?.[0] || "?")}
                {(m.profile?.last_name?.[0] || "")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {m.profile?.last_name || "—"} {m.profile?.first_name || ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.profile?.position || "—"} · {m.role === "admin" ? "Администратор" : "Пользователь"}
                </p>
              </div>
              {m.user_id !== user?.id && (
                <div className="flex gap-1">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleToggleRole(m.id, m.role)}
                    className="h-8 px-2"
                    title={m.role === "admin" ? "Снять права администратора" : "Назначить администратором"}
                  >
                    {m.role === "admin" ? <ShieldOff className="w-4 h-4 text-muted-foreground" /> : <Shield className="w-4 h-4 text-accent" />}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleRemoveMember(m.id, m.user_id)}
                    className="h-8 px-2 text-destructive"
                    title="Удалить из компании"
                  >
                    <UserMinus className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Team management */}
        <TeamManagement />

        {/* Desk management */}
        <DeskManagement />
      </div>
    </div>
  );
};

export default CompanySettings;
