import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Team {
  id: string;
  name: string;
  created_at: string;
}

const TeamManagement = () => {
  const { membership } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const companyId = membership?.company_id;

  const fetchTeams = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("teams")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at");
    setTeams(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTeams(); }, [companyId]);

  const handleAdd = async () => {
    if (!companyId || !newName.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("teams").insert({ company_id: companyId, name: newName.trim() });
    if (error) toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    else { setNewName(""); fetchTeams(); }
    setAdding(false);
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from("teams").update({ name: editName.trim() }).eq("id", id);
    if (error) toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    else { setEditingId(null); fetchTeams(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    else fetchTeams();
  };

  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card border border-border rounded-2xl p-6 space-y-3">
      <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
        <Users className="w-4 h-4" /> Команды
      </h3>

      {/* Add new */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Название команды"
          className="h-9 bg-secondary/50"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" onClick={handleAdd} disabled={adding || !newName.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90 h-9 px-3">
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* List */}
      {teams.map((t) => (
        <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/30">
          {editingId === t.id ? (
            <>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 bg-secondary/50 flex-1"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleRename(t.id)}
              />
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => handleRename(t.id)}>
                <Check className="w-4 h-4 text-accent" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingId(null)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm font-medium text-foreground">{t.name}</span>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setEditingId(t.id); setEditName(t.name); }}>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить команду?</AlertDialogTitle>
                    <AlertDialogDescription>Команда «{t.name}» будет удалена безвозвратно.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(t.id)}>Удалить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      ))}

      {teams.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">Нет команд</p>
      )}
    </motion.div>
  );
};

export default TeamManagement;
