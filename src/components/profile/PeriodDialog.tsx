import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Period {
  id?: string;
  start_date: string;
  end_date: string;
  isNew?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  table: "vacations" | "sick_leaves";
}

const PeriodDialog = ({ open, onOpenChange, title, table }: Props) => {
  const { user, membership } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [toDelete, setToDelete] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    const fetch = async () => {
      setLoading(true);
      setToDelete([]);
      const { data } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", user.id)
        .order("start_date", { ascending: true });
      setPeriods((data || []).map(d => ({ id: d.id, start_date: d.start_date, end_date: d.end_date })));
      setLoading(false);
    };
    fetch();
  }, [open, user, table]);

  const addPeriod = () => {
    setPeriods(prev => [...prev, { start_date: "", end_date: "", isNew: true }]);
  };

  const removePeriod = (index: number) => {
    const p = periods[index];
    if (p.id) setToDelete(prev => [...prev, p.id!]);
    setPeriods(prev => prev.filter((_, i) => i !== index));
  };

  const updatePeriod = (index: number, field: "start_date" | "end_date", value: string) => {
    setPeriods(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    if (!user || !membership) return;
    setSaving(true);

    // Delete removed
    for (const id of toDelete) {
      await supabase.from(table).delete().eq("id", id);
    }

    // Upsert remaining
    for (const p of periods) {
      if (!p.start_date || !p.end_date) continue;
      if (p.id && !p.isNew) {
        await supabase.from(table).update({ start_date: p.start_date, end_date: p.end_date }).eq("id", p.id);
      } else {
        await supabase.from(table).insert({
          user_id: user.id,
          company_id: membership.company_id,
          start_date: p.start_date,
          end_date: p.end_date,
        });
      }
    }

    setSaving(false);
    toast({ title: "Сохранено" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">{title}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {periods.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Нет записей</p>
            )}
            {periods.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="date"
                  value={p.start_date}
                  onChange={(e) => updatePeriod(i, "start_date", e.target.value)}
                  className="h-9 bg-secondary/50 flex-1"
                />
                <span className="text-muted-foreground text-sm">—</span>
                <Input
                  type="date"
                  value={p.end_date}
                  onChange={(e) => updatePeriod(i, "end_date", e.target.value)}
                  className="h-9 bg-secondary/50 flex-1"
                />
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removePeriod(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={addPeriod} className="w-full">
              <Plus className="w-4 h-4 mr-1.5" /> Добавить
            </Button>
            <Button onClick={handleSave} disabled={saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Сохранить
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PeriodDialog;
