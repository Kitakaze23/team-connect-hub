import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  Search,
  Shield,
  LogOut,
  Loader2,
  Pencil,
  UserCog,
  Mail,
  KeyRound,
  ScrollText,
  Plus,
  Ban,
  CheckCircle2,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  created_at: string;
  status: string;
  member_count: number;
  team_count: number;
}

interface CompanyDetails {
  teams: { id: string; name: string }[];
  members: {
    id: string;
    user_id: string;
    role: string;
    email: string;
    profile?: {
      first_name: string;
      last_name: string;
      position: string | null;
      team: string | null;
    };
  }[];
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [companyDetails, setCompanyDetails] = useState<Record<string, CompanyDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());

  // Edit company name dialog
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Create company dialog
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  // User management dialog
  const [editUser, setEditUser] = useState<{ user_id: string; email: string; name: string; role: string; company_id: string } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [userSaving, setUserSaving] = useState(false);

  // Audit logs
  const [showLogs, setShowLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Search results highlight
  const [highlightedCompanyIds, setHighlightedCompanyIds] = useState<Set<string>>(new Set());
  const [highlightedUserIds, setHighlightedUserIds] = useState<Set<string>>(new Set());

  const callAdmin = useCallback(async (action: string, params: Record<string, any> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/admin");
      return null;
    }

    const res = await supabase.functions.invoke("platform-admin", {
      body: { action, ...params },
    });

    if (res.error) {
      const context = (res.error as any)?.context;
      let detailedMessage = res.error.message;

      if (context) {
        try {
          const payload = await context.json();
          detailedMessage = payload?.error || payload?.message || detailedMessage;
        } catch {
          try {
            const fallbackText = await context.text();
            if (fallbackText) detailedMessage = fallbackText;
          } catch {
            // keep default message
          }
        }
      }

      if (detailedMessage?.includes("403") || detailedMessage?.includes("Forbidden")) {
        await supabase.auth.signOut();
        navigate("/admin");
        return null;
      }

      throw new Error(detailedMessage);
    }

    return res.data;
  }, [navigate]);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdmin("list_companies");
      if (data) setCompanies(data);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  }, [callAdmin, toast]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const toggleCompany = async (companyId: string) => {
    const next = new Set(expandedCompanies);
    if (next.has(companyId)) {
      next.delete(companyId);
    } else {
      next.add(companyId);
      if (!companyDetails[companyId]) {
        setDetailsLoading((prev) => new Set(prev).add(companyId));
        try {
          const data = await callAdmin("get_company_details", { company_id: companyId });
          if (data) setCompanyDetails((prev) => ({ ...prev, [companyId]: data }));
        } catch {}
        setDetailsLoading((prev) => {
          const n = new Set(prev);
          n.delete(companyId);
          return n;
        });
      }
    }
    setExpandedCompanies(next);
  };

  const handleSaveCompanyName = async () => {
    if (!editCompany || !editName.trim()) return;
    setEditSaving(true);
    try {
      await callAdmin("update_company_name", { company_id: editCompany.id, name: editName.trim() });
      toast({ title: "Название обновлено" });
      setEditCompany(null);
      fetchCompanies();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setEditSaving(false);
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim() || !newOwnerEmail.trim() || !newOwnerPassword.trim()) return;

    const normalizedEmail = newOwnerEmail.trim().toLowerCase();
    const emailRegex = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

    if (!emailRegex.test(normalizedEmail)) {
      toast({
        title: "Некорректный email",
        description: "Введите email владельца в формате name@company.com (латиница).",
        variant: "destructive",
      });
      return;
    }

    setCreateSaving(true);
    try {
      await callAdmin("create_company", {
        name: newCompanyName.trim(),
        owner_email: normalizedEmail,
        owner_password: newOwnerPassword,
      });
      toast({ title: "Компания создана", description: `«${newCompanyName}» успешно создана` });
      setShowCreateCompany(false);
      setNewCompanyName("");
      setNewOwnerEmail("");
      setNewOwnerPassword("");
      fetchCompanies();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setCreateSaving(false);
    }
  };

  const handleSuspendCompany = async (companyId: string) => {
    try {
      await callAdmin("suspend_company", { company_id: companyId });
      toast({ title: "Компания приостановлена" });
      fetchCompanies();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
  };

  const handleActivateCompany = async (companyId: string) => {
    try {
      await callAdmin("activate_company", { company_id: companyId });
      toast({ title: "Компания активирована" });
      fetchCompanies();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить компанию «${companyName}»? Все данные будут потеряны.`)) return;
    try {
      await callAdmin("delete_company", { company_id: companyId });
      toast({ title: "Компания удалена" });
      setCompanyDetails((prev) => { const n = { ...prev }; delete n[companyId]; return n; });
      fetchCompanies();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateUserName = async () => {
    if (!editUser || !newFirstName.trim()) return;
    setUserSaving(true);
    try {
      await callAdmin("update_user_name", { target_user_id: editUser.user_id, first_name: newFirstName.trim(), last_name: newLastName.trim() });
      toast({ title: "ФИО обновлено" });
      // Refresh details
      const companyIds = Object.keys(companyDetails);
      for (const cid of companyIds) {
        const data = await callAdmin("get_company_details", { company_id: cid });
        if (data) setCompanyDetails((prev) => ({ ...prev, [cid]: data }));
      }
      setEditUser((prev) => prev ? { ...prev, name: `${newLastName.trim()} ${newFirstName.trim()}`.trim() } : null);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setUserSaving(false);
  };

  const handleToggleRole = async () => {
    if (!editUser) return;
    const newRole = editUser.role === "admin" ? "user" : "admin";
    setUserSaving(true);
    try {
      await callAdmin("set_user_role", { target_user_id: editUser.user_id, company_id: editUser.company_id, new_role: newRole });
      toast({ title: newRole === "admin" ? "Назначен администратором" : "Роль изменена на пользователя" });
      setEditUser((prev) => prev ? { ...prev, role: newRole } : null);
      // Refresh details
      const companyIds = Object.keys(companyDetails);
      for (const cid of companyIds) {
        const data = await callAdmin("get_company_details", { company_id: cid });
        if (data) setCompanyDetails((prev) => ({ ...prev, [cid]: data }));
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setUserSaving(false);
  };

  const handleUpdateEmail = async () => {
    if (!editUser || !newEmail.trim()) return;
    setUserSaving(true);
    try {
      await callAdmin("update_user_email", { target_user_id: editUser.user_id, new_email: newEmail.trim() });
      toast({ title: "Email обновлён" });
      const companyIds = Object.keys(companyDetails);
      for (const cid of companyIds) {
        const data = await callAdmin("get_company_details", { company_id: cid });
        if (data) setCompanyDetails((prev) => ({ ...prev, [cid]: data }));
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setUserSaving(false);
  };

  const handleResetPassword = async () => {
    if (!editUser || !newPassword) return;
    setUserSaving(true);
    try {
      await callAdmin("reset_user_password", { target_user_id: editUser.user_id, new_password: newPassword });
      toast({ title: "Пароль сброшен" });
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setUserSaving(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setHighlightedCompanyIds(new Set());
      setHighlightedUserIds(new Set());
      return;
    }

    try {
      const data = await callAdmin("search", { query: searchQuery.trim() });
      if (!data) return;

      const companyIds = new Set<string>();
      const userIds = new Set<string>();

      data.companies?.forEach((c: any) => companyIds.add(c.id));
      data.teams?.forEach((t: any) => companyIds.add(t.company_id));
      data.profiles?.forEach((p: any) => {
        if (p.company_id) companyIds.add(p.company_id);
        userIds.add(p.user_id);
      });
      data.email_matches?.forEach((e: any) => userIds.add(e.user_id));

      setHighlightedCompanyIds(companyIds);
      setHighlightedUserIds(userIds);

      for (const cid of companyIds) {
        if (!expandedCompanies.has(cid)) {
          await toggleCompany(cid);
        }
      }
    } catch {}
  };

  const handleShowLogs = async () => {
    setShowLogs(true);
    setLogsLoading(true);
    try {
      const data = await callAdmin("get_audit_logs");
      if (data) setAuditLogs(data);
    } catch {}
    setLogsLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-sm font-mono font-semibold">Кабинет управляющего</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" onClick={() => setShowCreateCompany(true)} className="h-8 gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Создать компанию
          </Button>
          <Button size="sm" variant="ghost" onClick={handleShowLogs} title="Журнал действий">
            <ScrollText className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Поиск по компаниям, командам, пользователям, email..."
              className="pl-9 h-9"
            />
          </div>
          <Button size="sm" onClick={handleSearch} className="h-9">
            Найти
          </Button>
          {(highlightedCompanyIds.size > 0 || highlightedUserIds.size > 0) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setHighlightedCompanyIds(new Set());
                setHighlightedUserIds(new Set());
                setSearchQuery("");
              }}
              className="h-9 text-xs"
            >
              Сбросить
            </Button>
          )}
        </div>

        {/* Companies list */}
        <div className="space-y-3">
          {companies.map((company) => (
            <div
              key={company.id}
              className={`bg-card border rounded-xl overflow-hidden transition-colors ${
                highlightedCompanyIds.has(company.id) ? "border-primary ring-1 ring-primary/30" : "border-border"
              } ${company.status === "suspended" ? "opacity-70" : ""}`}
            >
              <Collapsible open={expandedCompanies.has(company.id)}>
                <div className="flex items-center gap-3 p-4">
                  <CollapsibleTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => toggleCompany(company.id)}
                    >
                      {expandedCompanies.has(company.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{company.name}</p>
                      {company.status === "suspended" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-mono">
                          Приостановлена
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(company.created_at).toLocaleDateString("ru")} · {company.member_count} чел. · {company.team_count} команд
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {company.status === "suspended" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                        onClick={() => handleActivateCompany(company.id)}
                        title="Активировать компанию"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleSuspendCompany(company.id)}
                        title="Приостановить компанию"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setEditCompany(company);
                        setEditName(company.name);
                      }}
                      title="Изменить название"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteCompany(company.id, company.name)}
                      title="Удалить компанию"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t border-border pt-3">
                    {detailsLoading.has(company.id) ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : companyDetails[company.id] ? (
                      <CompanyTree
                        details={companyDetails[company.id]}
                        companyId={company.id}
                        highlightedUserIds={highlightedUserIds}
                        onEditUser={(u) => {
                          setEditUser(u);
                          setNewEmail(u.email);
                          setNewPassword("");
                          const parts = u.name.split(" ");
                          setNewLastName(parts[0] || "");
                          setNewFirstName(parts.slice(1).join(" ") || "");
                        }}
                      />
                    ) : null}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}

          {companies.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Нет компаний</p>
          )}
        </div>
      </div>

      {/* Create company dialog */}
      <Dialog open={showCreateCompany} onOpenChange={setShowCreateCompany}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono flex items-center gap-2">
              <Plus className="w-4 h-4" /> Создать компанию
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Название компании</Label>
              <Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} className="h-9" placeholder="Моя компания" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email владельца</Label>
              <Input value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} className="h-9" placeholder="owner@company.com" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Пароль владельца</Label>
              <Input value={newOwnerPassword} onChange={(e) => setNewOwnerPassword(e.target.value)} className="h-9" placeholder="Минимум 6 символов" type="password" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleCreateCompany} disabled={createSaving || !newCompanyName.trim() || !newOwnerEmail.trim() || !newOwnerPassword.trim()}>
              {createSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit company name dialog */}
      <Dialog open={!!editCompany} onOpenChange={(o) => !o && setEditCompany(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">Изменить название</DialogTitle>
          </DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
          <DialogFooter>
            <Button size="sm" onClick={handleSaveCompanyName} disabled={editSaving}>
              {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono flex items-center gap-2">
              <UserCog className="w-4 h-4" /> {editUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name editing */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> ФИО
              </Label>
              <div className="flex gap-2">
                <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="h-9" placeholder="Фамилия" />
                <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="h-9" placeholder="Имя" />
                <Button size="sm" onClick={handleUpdateUserName} disabled={userSaving} className="h-9 shrink-0">
                  Сохранить
                </Button>
              </div>
            </div>

            {/* Role toggle */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                {editUser?.role === "admin" ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />} Роль
              </Label>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono px-2 py-1 rounded ${editUser?.role === "admin" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {editUser?.role === "admin" ? "Администратор" : "Пользователь"}
                </span>
                <Button size="sm" variant="outline" onClick={handleToggleRole} disabled={userSaving} className="h-8 text-xs">
                  {editUser?.role === "admin" ? "Снять админа" : "Назначить админом"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email
              </Label>
              <div className="flex gap-2">
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="h-9" />
                <Button size="sm" onClick={handleUpdateEmail} disabled={userSaving} className="h-9">
                  Сохранить
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> Новый пароль
              </Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Введите новый пароль"
                  className="h-9"
                />
                <Button size="sm" onClick={handleResetPassword} disabled={userSaving || !newPassword} className="h-9">
                  Сбросить
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit logs dialog */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono flex items-center gap-2">
              <ScrollText className="w-4 h-4" /> Журнал действий
            </DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">Нет записей</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-lg bg-secondary/30 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="font-mono font-medium">{log.action}</span>
                    <span className="text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("ru")}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {log.target_type}: {log.target_id?.slice(0, 8)}…
                    {log.details && Object.keys(log.details).length > 0 && (
                      <span> · {JSON.stringify(log.details)}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Company tree sub-component
const CompanyTree = ({
  details,
  companyId,
  highlightedUserIds,
  onEditUser,
}: {
  details: CompanyDetails;
  companyId: string;
  highlightedUserIds: Set<string>;
  onEditUser: (u: { user_id: string; email: string; name: string; role: string; company_id: string }) => void;
}) => {
  const teamMembers = (teamName: string) =>
    details.members.filter((m) => m.profile?.team === teamName);
  const unassigned = details.members.filter(
    (m) => !m.profile?.team || !details.teams.some((t) => t.name === m.profile?.team)
  );

  return (
    <div className="space-y-3 text-sm">
      {details.teams.map((team) => {
        const members = teamMembers(team.name);
        return (
          <div key={team.id}>
            <p className="text-xs font-mono font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
              <Users className="w-3.5 h-3.5" /> {team.name} ({members.length})
            </p>
            <div className="ml-5 space-y-1">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  highlighted={highlightedUserIds.has(m.user_id)}
                  onEdit={onEditUser}
                />
              ))}
              {members.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Нет участников</p>
              )}
            </div>
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div>
          <p className="text-xs font-mono font-semibold text-muted-foreground mb-1.5">
            Без команды ({unassigned.length})
          </p>
          <div className="ml-5 space-y-1">
            {unassigned.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                highlighted={highlightedUserIds.has(m.user_id)}
                onEdit={onEditUser}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const MemberRow = ({
  member,
  highlighted,
  onEdit,
}: {
  member: CompanyDetails["members"][0];
  highlighted: boolean;
  onEdit: (u: { user_id: string; email: string; name: string }) => void;
}) => {
  const name = `${member.profile?.last_name || ""} ${member.profile?.first_name || ""}`.trim() || "—";
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
        highlighted ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary/30"
      }`}
    >
      <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
        {member.profile?.first_name?.[0] || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
      </div>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
          member.role === "admin"
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-muted-foreground"
        }`}
      >
        {member.role === "admin" ? "Админ" : "Пользователь"}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        onClick={() => onEdit({ user_id: member.user_id, email: member.email, name })}
        title="Управление учётными данными"
      >
        <UserCog className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
};

export default AdminDashboard;
