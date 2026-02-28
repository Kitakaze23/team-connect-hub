import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Loader2, Upload, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Desk {
  id: string;
  name: string;
  sort_order: number;
}

interface DeskAssignment {
  id: string;
  desk_id: string;
  user_id: string;
  day_of_week: string;
}

interface ProfileUser {
  user_id: string;
  first_name: string;
  last_name: string;
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс",
};

const DeskManagement = () => {
  const { membership } = useAuth();
  const { toast } = useToast();
  const companyId = membership?.company_id;

  const [enabled, setEnabled] = useState(false);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [newDeskName, setNewDeskName] = useState("");
  const [loading, setLoading] = useState(true);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [users, setUsers] = useState<ProfileUser[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>("mon");
  const [assignments, setAssignments] = useState<DeskAssignment[]>([]);
  const [assigningDesk, setAssigningDesk] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      setLoading(true);
      const [companyRes, desksRes, usersRes, assignRes] = await Promise.all([
        supabase.from("companies").select("desk_sharing_enabled, floor_plan_url").eq("id", companyId).single(),
        supabase.from("desks").select("id, name, sort_order").eq("company_id", companyId).order("sort_order"),
        supabase.from("profiles").select("user_id, first_name, last_name").eq("company_id", companyId),
        supabase.from("desk_assignments").select("id, desk_id, user_id, day_of_week").eq("company_id", companyId),
      ]);
      setEnabled(companyRes.data?.desk_sharing_enabled || false);
      setFloorPlanUrl(companyRes.data?.floor_plan_url || null);
      setDesks(desksRes.data || []);
      setUsers(usersRes.data || []);
      setAssignments(assignRes.data || []);
      setLoading(false);
    };
    fetch();
  }, [companyId]);

  const dayAssignments = assignments.filter(a => a.day_of_week === selectedDay);

  const toggleEnabled = async () => {
    if (!companyId) return;
    const next = !enabled;
    await supabase.from("companies").update({ desk_sharing_enabled: next }).eq("id", companyId);
    setEnabled(next);
    toast({ title: next ? "Рассадка включена" : "Рассадка выключена" });
  };

  const addDesk = async () => {
    if (!companyId || !newDeskName.trim()) return;
    const { data, error } = await supabase
      .from("desks")
      .insert({ company_id: companyId, name: newDeskName.trim(), sort_order: desks.length })
      .select("id, name, sort_order")
      .single();
    if (error) { toast({ title: "Ошибка", description: error.message, variant: "destructive" }); return; }
    if (data) setDesks(prev => [...prev, data]);
    setNewDeskName("");
  };

  const deleteDesk = async (deskId: string) => {
    const deskAssigns = assignments.filter(a => a.desk_id === deskId);
    if (deskAssigns.length > 0) {
      const confirmed = window.confirm(`У этого стола есть ${deskAssigns.length} назначений. Они будут удалены. Продолжить?`);
      if (!confirmed) return;
      await supabase.from("desk_assignments").delete().eq("desk_id", deskId);
    }
    await supabase.from("desks").delete().eq("id", deskId);
    setDesks(prev => prev.filter(d => d.id !== deskId));
    setAssignments(prev => prev.filter(a => a.desk_id !== deskId));
  };

  const handleFloorPlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["png", "jpg", "jpeg", "svg"].includes(ext || "")) {
      toast({ title: "Неверный формат", description: "Поддерживаются PNG, JPG, SVG", variant: "destructive" });
      return;
    }
    setUploading(true);
    const path = `floor-plans/${companyId}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadErr) { toast({ title: "Ошибка загрузки", description: uploadErr.message, variant: "destructive" }); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = urlData.publicUrl + "?t=" + Date.now();
    await supabase.from("companies").update({ floor_plan_url: url }).eq("id", companyId);
    setFloorPlanUrl(url);
    setUploading(false);
    toast({ title: "Схема загружена" });
  };

  const removeFloorPlan = async () => {
    if (!companyId) return;
    await supabase.from("companies").update({ floor_plan_url: null }).eq("id", companyId);
    setFloorPlanUrl(null);
  };

  const assignUser = async (deskId: string, userId: string) => {
    if (!companyId) return;
    // Remove existing assignment for this user on this day
    const existing = assignments.find(a => a.user_id === userId && a.day_of_week === selectedDay);
    if (existing) {
      await supabase.from("desk_assignments").delete().eq("id", existing.id);
      setAssignments(prev => prev.filter(a => a.id !== existing.id));
    }
    // Remove existing assignment for this desk on this day
    const deskExisting = assignments.find(a => a.desk_id === deskId && a.day_of_week === selectedDay);
    if (deskExisting) {
      await supabase.from("desk_assignments").delete().eq("id", deskExisting.id);
      setAssignments(prev => prev.filter(a => a.id !== deskExisting.id));
    }
    const { data, error } = await supabase
      .from("desk_assignments")
      .insert({ company_id: companyId, desk_id: deskId, user_id: userId, day_of_week: selectedDay })
      .select("id, desk_id, user_id, day_of_week")
      .single();
    if (error) { toast({ title: "Ошибка", description: error.message, variant: "destructive" }); return; }
    if (data) setAssignments(prev => [...prev, data]);
    setAssigningDesk(null);
  };

  const unassign = async (assignmentId: string) => {
    await supabase.from("desk_assignments").delete().eq("id", assignmentId);
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
  };

  const getUserName = (userId: string) => {
    const u = users.find(u => u.user_id === userId);
    return u ? `${u.first_name} ${u.last_name}` : "—";
  };

  if (loading) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <h3 className="text-sm font-mono font-semibold text-foreground flex items-center gap-2">
        <Users className="w-4 h-4" /> Рассадка (Desk Sharing)
      </h3>

      <div className="flex items-center justify-between">
        <Label className="text-sm text-foreground">Функция рассадки</Label>
        <Switch checked={enabled} onCheckedChange={toggleEnabled} />
      </div>

      {!enabled && (
        <p className="text-xs text-muted-foreground">Включите рассадку, чтобы управлять столами и назначениями.</p>
      )}

      {enabled && (
        <div className="space-y-4">
          {/* Floor plan */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Схема офиса</Label>
            {floorPlanUrl ? (
              <div className="relative">
                <img src={floorPlanUrl} alt="Схема офиса" className="w-full rounded-lg border border-border max-h-48 object-contain bg-secondary" />
                <button onClick={removeFloorPlan} className="absolute top-2 right-2 p-1 rounded-full bg-destructive text-destructive-foreground hover:opacity-80">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-xl p-4 hover:border-accent/30 transition-colors">
                <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleFloorPlanUpload} className="hidden" />
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
                <span className="text-sm text-muted-foreground">Загрузить схему (PNG, JPG, SVG)</span>
              </label>
            )}
          </div>

          {/* Desks management */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Столы ({desks.length})</Label>
            <div className="flex gap-2">
              <Input value={newDeskName} onChange={(e) => setNewDeskName(e.target.value)} placeholder="Название стола (напр. A3)"
                className="h-9 bg-secondary/50" onKeyDown={(e) => e.key === "Enter" && addDesk()} />
              <Button size="sm" onClick={addDesk} disabled={!newDeskName.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {desks.map(desk => (
                <div key={desk.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                  <span className="text-sm text-foreground flex-1">{desk.name}</span>
                  <button onClick={() => deleteDesk(desk.id)} className="text-destructive hover:text-destructive/80 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {desks.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Добавьте столы</p>}
            </div>
          </div>

          {/* Assignments by day of week */}
          {desks.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Назначение по дням недели</Label>
              <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
                {DAY_KEYS.map(day => (
                  <button key={day} onClick={() => { setSelectedDay(day); setAssigningDesk(null); }}
                    className={`px-3 py-1.5 text-xs rounded-md transition-all flex-1 ${selectedDay === day ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                    {DAY_LABELS[day]}
                  </button>
                ))}
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {desks.map(desk => {
                  const assignment = dayAssignments.find(a => a.desk_id === desk.id);
                  return (
                    <div key={desk.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                      <span className="text-sm font-medium text-foreground w-24 truncate">{desk.name}</span>
                      {assignment ? (
                        <>
                          <span className="text-sm text-foreground flex-1">{getUserName(assignment.user_id)}</span>
                          <button onClick={() => unassign(assignment.id)} className="text-destructive hover:text-destructive/80 p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : assigningDesk === desk.id ? (
                        <div className="flex-1">
                          <Select onValueChange={(v) => assignUser(desk.id, v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Выберите сотрудника" />
                            </SelectTrigger>
                            <SelectContent>
                              {users.filter(u => !dayAssignments.some(a => a.user_id === u.user_id)).map(u => (
                                <SelectItem key={u.user_id} value={u.user_id}>
                                  {u.first_name} {u.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground flex-1">Свободен</span>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAssigningDesk(desk.id)}>
                            Назначить
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default DeskManagement;
