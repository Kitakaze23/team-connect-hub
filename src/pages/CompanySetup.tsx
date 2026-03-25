import { useState } from "react";
import { motion } from "framer-motion";
import { Terminal, KeyRound, LogOut, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const CompanySetup = () => {
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [foundCompany, setFoundCompany] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const { user, signOut, refreshMembership } = useAuth();

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
          <p className="text-muted-foreground text-sm">Присоединитесь к компании</p>
        </div>

        <div className="glass rounded-2xl p-8 shadow-lg">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center mb-6">
              Введите код приглашения, чтобы присоединиться к компании
            </p>
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
              <Button onClick={handleLookup} disabled={loading || !inviteCode.trim()} className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
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
                <Button
                  onClick={() => setFoundCompany(null)}
                  variant="ghost"
                  className="w-full text-sm"
                >
                  Другая компания
                </Button>
              </div>
            )}
          </div>
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
