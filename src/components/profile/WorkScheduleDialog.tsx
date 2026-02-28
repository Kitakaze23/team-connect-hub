import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Wifi, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const dayLabels: Record<string, string> = {
  mon: "Понедельник", tue: "Вторник", wed: "Среда", thu: "Четверг", fri: "Пятница",
};

type DayValue = "office" | "remote";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WorkScheduleDialog = ({ open, onOpenChange }: Props) => {
  const { user, membership } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<Record<string, DayValue>>({
    mon: "office", tue: "office", wed: "office", thu: "office", fri: "office",
  });
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("work_schedules")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setSchedule({ mon: data.mon as DayValue, tue: data.tue as DayValue, wed: data.wed as DayValue, thu: data.thu as DayValue, fri: data.fri as DayValue });
        setExistingId(data.id);
      } else {
        setExistingId(null);
      }
      setLoading(false);
    };
    fetch();
  }, [open, user]);

  const toggle = (day: string) => {
    setSchedule(prev => ({ ...prev, [day]: prev[day] === "office" ? "remote" : "office" }));
  };

  const handleSave = async () => {
    if (!user || !membership) return;
    setSaving(true);
    const payload = { ...schedule, user_id: user.id, company_id: membership.company_id, updated_at: new Date().toISOString() };
    
    let error;
    if (existingId) {
      ({ error } = await supabase.from("work_schedules").update(payload).eq("id", existingId));
    } else {
      ({ error } = await supabase.from("work_schedules").insert(payload));
    }
    
    setSaving(false);
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Режим работы сохранён" });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">Режим работы</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {Object.entries(dayLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:bg-secondary/50 transition-colors"
              >
                <span className="text-sm font-medium text-foreground">{label}</span>
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${
                  schedule[key] === "office"
                    ? "bg-status-office/15 text-status-office"
                    : "bg-status-remote/15 text-status-remote"
                }`}>
                  {schedule[key] === "office" ? <Building2 className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                  {schedule[key] === "office" ? "Офис" : "Удалённо"}
                </div>
              </button>
            ))}
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

export default WorkScheduleDialog;
