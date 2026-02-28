import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Monitor, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  date: string;
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

const DeskSharingView = ({ onBack }: DeskSharingViewProps) => {
  const { membership } = useAuth();
  const companyId = membership?.company_id;

  const [desks, setDesks] = useState<Desk[]>([]);
  const [users, setUsers] = useState<ProfileUser[]>([]);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Date navigation
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Vacation/sick data for freeing desks
  const [vacations, setVacations] = useState<{ user_id: string; start_date: string; end_date: string }[]>([]);
  const [sickLeaves, setSickLeaves] = useState<{ user_id: string; start_date: string; end_date: string }[]>([]);

  const dateStr = (d: Date) => d.toISOString().split("T")[0];

  const getWeekDates = () => {
    const dates: Date[] = [];
    const start = new Date(currentDate);
    for (let i = 0; i < 7; i++) {
      dates.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return dates;
  };

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      setLoading(true);
      const [desksRes, usersRes, companyRes, vacRes, sickRes] = await Promise.all([
        supabase.from("desks").select("id, name, sort_order").eq("company_id", companyId).order("sort_order"),
        supabase.from("profiles").select("user_id, first_name, last_name, avatar_url").eq("company_id", companyId),
        supabase.from("companies").select("floor_plan_url").eq("id", companyId).single(),
        supabase.from("vacations").select("user_id, start_date, end_date").eq("company_id", companyId),
        supabase.from("sick_leaves").select("user_id, start_date, end_date").eq("company_id", companyId),
      ]);
      setDesks(desksRes.data || []);
      setUsers(usersRes.data || []);
      setFloorPlanUrl(companyRes.data?.floor_plan_url || null);
      setVacations(vacRes.data || []);
      setSickLeaves(sickRes.data || []);
      setLoading(false);
    };
    fetch();
  }, [companyId]);

  // Load assignments for current date range
  useEffect(() => {
    if (!companyId || desks.length === 0) return;
    const fetch = async () => {
      let startDate: string, endDate: string;
      if (viewMode === "day") {
        startDate = endDate = dateStr(currentDate);
      } else {
        const dates = getWeekDates();
        startDate = dateStr(dates[0]);
        endDate = dateStr(dates[6]);
      }
      const { data } = await supabase
        .from("desk_assignments")
        .select("id, desk_id, user_id, date")
        .eq("company_id", companyId)
        .gte("date", startDate)
        .lte("date", endDate);
      setAssignments(data || []);
    };
    fetch();
  }, [companyId, currentDate, viewMode, desks]);

  const isUserAbsent = (userId: string, date: string) => {
    const onVacation = vacations.some(v => v.user_id === userId && v.start_date <= date && v.end_date >= date);
    const onSick = sickLeaves.some(s => s.user_id === userId && s.start_date <= date && s.end_date >= date);
    return onVacation || onSick;
  };

  const getUserInfo = (userId: string) => users.find(u => u.user_id === userId);

  const getDayData = (date: string) => {
    const dayAssignments = assignments.filter(a => a.date === date);
    const occupied = dayAssignments.filter(a => !isUserAbsent(a.user_id, date)).length;
    const free = desks.length - occupied;
    return { dayAssignments, occupied, free };
  };

  const navigate = (delta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (viewMode === "week" ? delta * 7 : delta));
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const formatDate = (d: Date) => d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const renderDayView = (date: string, label?: string) => {
    const { dayAssignments, occupied, free } = getDayData(date);
    return (
      <div key={date} className="space-y-2">
        {label && <h4 className="text-xs font-mono text-muted-foreground">{label}</h4>}
        <div className="flex gap-3 text-xs text-muted-foreground mb-2">
          <span>Всего: <b className="text-foreground">{desks.length}</b></span>
          <span>Занято: <b className="text-foreground">{occupied}</b></span>
          <span>Свободно: <b className="text-accent">{free}</b></span>
        </div>
        <div className="space-y-1">
          {desks.map(desk => {
            const assignment = dayAssignments.find(a => a.desk_id === desk.id);
            const absent = assignment ? isUserAbsent(assignment.user_id, date) : false;
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
    );
  };

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

      {/* Navigation */}
      <div className="shrink-0 px-4 py-3 flex items-center gap-2 border-b border-border">
        <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
          <button onClick={() => setViewMode("day")}
            className={`px-3 py-1 text-xs rounded-md transition-all ${viewMode === "day" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            День
          </button>
          <button onClick={() => setViewMode("week")}
            className={`px-3 py-1 text-xs rounded-md transition-all ${viewMode === "week" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            Неделя
          </button>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-secondary rounded"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={goToday} className="text-xs text-accent font-medium px-2">Сегодня</button>
          <button onClick={() => navigate(1)} className="p-1 hover:bg-secondary rounded"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <span className="text-xs text-muted-foreground ml-2">
          {viewMode === "day" ? formatDate(currentDate) : `${formatDate(getWeekDates()[0])} — ${formatDate(getWeekDates()[6])}`}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Floor plan */}
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
        ) : viewMode === "day" ? (
          renderDayView(dateStr(currentDate))
        ) : (
          getWeekDates().map(d => renderDayView(dateStr(d), formatDate(d)))
        )}
      </div>
    </div>
  );
};

export default DeskSharingView;
