import { useState } from "react";
import { motion } from "framer-motion";
import { Terminal, Building2, KeyRound, Plus, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const CompanySetup = () => {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [foundCompany, setFoundCompany] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const { user, signOut, refreshMembership } = useAuth();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !companyName.trim()) return;
    setLoading(true);
    try {
      // Create company
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({ name: companyName.trim(), owner_id: user.id })
        .select()
        .single();

      if (companyError) throw companyError;

      // Add self as approved admin member
      const { error: memberError } = await supabase
        .from("company_members")
        .insert({ company_id: company.id, user_id: user.id, status: "pending", role: "user" });

      if (memberError) throw memberError;

      // Use edge function to approve self as admin (since RLS only allows pending inserts)
      const { error: approveError } = await supabase.functions.invoke("approve-company-owner", {
        body: { company_id: company.id },
      });

      if (approveError) throw approveError;

      // Update profile with company_id
      await supabase.from("profiles").update({ company_id: company.id }).eq("user_id", user.id);

      toast({ title: "Компания создана!", description: `"${companyName}" успешно создана` });
      await refreshMembership();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleLookup = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("lookup_company_by_code", { _code: inviteCode.trim() });
      if (error) throw error;
      if (data && data.length > 0) {
        setFoundCompany({ id: data[0].id, name: data[0].name });
      } else {
        toast({ title: "Компания не найдена", description: "Проверьте код приглашения", variant: "destructive" });
        setFoundCompany(null);
      }
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!user || !foundCompany) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("company_members")
        .insert({ company_id: foundCompany.id, user_id: user.id, status: "pending" });
      if (error) {
        if (error.code === "23505") {
          toast({ title: "Запрос уже отправлен", description: "Ожидайте одобрения администратора" });
        } else throw error;
      } else {
        toast({ title: "Запрос отправлен!", description: "Ожидайте одобрения администратора компании" });
      }
      await refreshMembership();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Terminal className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-mono font-bold text-foreground tracking-tight">Терминал</h1>
          </div>
          <p className="text-muted-foreground text-sm">Настройка компании</p>
        </div>

        <div className="glass rounded-2xl p-8 shadow-lg">
          {mode === "choose" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center mb-6">
                Создайте новую компанию или присоединитесь к существующей
              </p>
              <Button
                onClick={() => setMode("create")}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
              >
                <Plus className="w-5 h-5 mr-2" />
                Создать компанию
              </Button>
              <Button
                onClick={() => setMode("join")}
                variant="outline"
                className="w-full h-12 rounded-xl"
              >
                <KeyRound className="w-5 h-5 mr-2" />
                Присоединиться по коду
              </Button>
            </div>
          )}

          {mode === "create" && (
            <form onSubmit={handleCreate} className="space-y-4">
              <button type="button" onClick={() => setMode("choose")} className="text-sm text-muted-foreground hover:text-foreground">
                ← Назад
              </button>
              <div className="space-y-2">
                <Label>Название компании</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Моя компания"
                    className="pl-10 h-11 bg-secondary/50"
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Создать
              </Button>
            </form>
          )}

          {mode === "join" && (
            <div className="space-y-4">
              <button type="button" onClick={() => { setMode("choose"); setFoundCompany(null); }} className="text-sm text-muted-foreground hover:text-foreground">
                ← Назад
              </button>
              <div className="space-y-2">
                <Label>Код приглашения</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Введите код"
                    className="pl-10 h-11 bg-secondary/50"
                  />
                </div>
              </div>

              {!foundCompany ? (
                <Button onClick={handleLookup} disabled={loading || !inviteCode.trim()} className="w-full h-11 rounded-xl" variant="outline">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Найти компанию
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{foundCompany.name}</p>
                        <p className="text-xs text-muted-foreground">Отправьте запрос на вступление</p>
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleJoin} disabled={loading} className="w-full h-11 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Отправить запрос
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <LogOut className="w-3 h-3" /> Выйти
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CompanySetup;
