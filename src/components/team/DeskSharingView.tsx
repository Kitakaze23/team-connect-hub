import { useState, useEffect } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Monitor } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Desk {
  id: string;
  name: string;
  sort_order: number;
}

interface Assignment {
  id: string;
  desk_id: string;
  user_id: string;
  day_of_week: string;
}

interface ProfileUser {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface DeskSharingViewProps {
  onBack: () => void;
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс",
};

const getTodayDayKey = () => {
  const idx = (new Date().getDay() + 6) % 7;
  return DAY_KEYS[idx];
};

const DeskSharingView = ({ onBack }: DeskSharingViewProps) => {
  const { membership } = useAuth();
  const companyId = membership?.company_id;

  const [desks, setDesks] = useState<Desk[]>([]);
  const [users, setUsers] = useState<ProfileUser[]>([]);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>(getTodayDayKey());

  const [vacations, setVacations] = useState<{ user_id: string; start_date: string; end_date: string }[]>([]);
  const [sickLeaves, setSickLeaves] = useState<{ user_id: string; start_date: string; end_date: string }[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      setLoading(true);
      const [desksRes, usersRes, companyRes, assignRes, vacRes, sickRes] = await Promise.all([
        supabase.from("desks").select("id, name, sort_order").eq("company_id", companyId).order("sort_order"),
        supabase.from("profiles").select("user_id, first_name, last_name, avatar_url").eq("company_id", companyId),
        supabase.from("companies").select("floor_plan_url").eq("id", companyId).single(),
        supabase.from("desk_assignments").select("id, desk_id, user_id, day_of_week").eq("company_id", companyId),
        supabase.from("vacations").select("user_id, start_date, end_date").eq("company_id", companyId),
        supabase.from("sick_leaves").select("user_id, start_date, end_date").eq("company_id", companyId),
      ]);
      setDesks(desksRes.data || []);
      setUsers(usersRes.data || []);
      setFloorPlanUrl(companyRes.data?.floor_plan_url || null);
      setAssignments(assignRes.data || []);
      setVacations(vacRes.data || []);
      setSickLeaves(sickRes.data || []);
      setLoading(false);
    };
    fetch();
  }, [companyId]);

  // Check if user is absent today (for "today" context)
  const isUserAbsentToday = (userId: string) => {
    const today = new Date().toISOString().split("T")[0];
    const onVacation = vacations.some(v => v.user_id === userId && v.start_date <= today && v.end_date >= today);
    const onSick = sickLeaves.some(s => s.user_id === userId && s.start_date <= today && s.end_date >= today);
    return onVacation || onSick;
  };

  const getUserInfo = (userId: string) => users.find(u => u.user_id === userId);

  const dayAssignments = assignments.filter(a => a.day_of_week === selectedDay);
  const isToday = selectedDay === getTodayDayKey();

  const occupied = dayAssignments.filter(a => !(isToday && isUserAbsentToday(a.user_id))).length;
  const free = desks.length - occupied;

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card/50 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Monitor className="w-5 h-5 text-accent" />
        <span className="text-sm font-mono font-semibold text-foreground">Рассадка</span>
      </div>

      {/* Day of week selector */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          {DAY_KEYS.map(day => (
            <button key={day} onClick={() => setSelectedDay(day)}
              className={`px-3 py-1.5 text-xs rounded-md transition-all flex-1 ${selectedDay === day ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              {DAY_LABELS[day]}
              {day === getTodayDayKey() && <span className="ml-1 text-accent">•</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {floorPlanUrl && (
          <div className="rounded-xl border border-border overflow-hidden">
            <img src={floorPlanUrl} alt="Схема офиса" className="w-full max-h-52 object-contain bg-secondary" />
          </div>
        )}

        {desks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Monitor className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Столы ещё не настроены администратором</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-3 text-xs text-muted-foreground mb-2">
              <span>Всего: <b className="text-foreground">{desks.length}</b></span>
              <span>Занято: <b className="text-foreground">{occupied}</b></span>
              <span>Свободно: <b className="text-accent">{free}</b></span>
            </div>
            <div className="space-y-1">
              {desks.map(desk => {
                const assignment = dayAssignments.find(a => a.desk_id === desk.id);
                const absent = assignment && isToday ? isUserAbsentToday(assignment.user_id) : false;
                const userInfo = assignment ? getUserInfo(assignment.user_id) : null;
                const isFree = !assignment || absent;
                return (
                  <Popover key={desk.id}>
                    <PopoverTrigger asChild>
                      <button className={`flex items-center gap-3 p-2.5 rounded-xl w-full text-left transition-all border ${
                        isFree ? "bg-accent/5 border-accent/20 hover:border-accent/40" : "bg-card border-border hover:border-border"
                      }`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isFree ? "bg-accent/20" : "bg-secondary"}`}>
                          <Monitor className={`w-4 h-4 ${isFree ? "text-accent" : "text-muted-foreground"}`} />
                        </div>
                        <span className="text-sm font-medium text-foreground w-20 truncate">{desk.name}</span>
                        {isFree ? (
                          <span className="text-xs text-accent font-medium">Свободен</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {userInfo?.avatar_url ? (
                              <img src={userInfo.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">
                                {userInfo?.first_name?.[0]}{userInfo?.last_name?.[0]}
                              </div>
                            )}
                            <span className="text-sm text-foreground">{userInfo?.first_name} {userInfo?.last_name}</span>
                            {absent && <span className="text-[10px] text-muted-foreground">(отсутствует)</span>}
                          </div>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3">
                      <p className="text-sm font-medium mb-1">{desk.name}</p>
                      {isFree ? (
                        <p className="text-xs text-accent">Стол свободен</p>
                      ) : (
                        <div className="flex items-center gap-2">
                          {userInfo?.avatar_url ? (
                            <img src={userInfo.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                              {userInfo?.first_name?.[0]}{userInfo?.last_name?.[0]}
                            </div>
                          )}
                          <div>
                            <p className="text-sm text-foreground">{userInfo?.first_name} {userInfo?.last_name}</p>
                            {absent && <p className="text-xs text-muted-foreground">Отсутствует (отпуск/больничный)</p>}
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeskSharingView;
