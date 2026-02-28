import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Wifi, Palmtree, Stethoscope, Users as UsersIcon, Loader2, Coffee, Monitor } from "lucide-react";
import { statusLabels, statusColors } from "@/lib/mockData";
import UserCardModal from "@/components/UserCardModal";
import DeskSharingView from "./DeskSharingView";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type StatusFilter = "all" | "office" | "remote" | "vacation" | "sick" | "day_off";

interface ProfileUser {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  position?: string | null;
  team?: string | null;
  phone?: string | null;
  messenger?: string | null;
  city?: string | null;
  birthday?: string | null;
  desk?: string | null;
  avatar_url?: string | null;
}

interface TeamRecord {
  id: string;
  name: string;
}

const statusIcons = {
  office: Building2,
  remote: Wifi,
  vacation: Palmtree,
  sick: Stethoscope,
  day_off: Coffee,
};

const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const TeamView = () => {
  const { membership } = useAuth();
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedUser, setSelectedUser] = useState<ProfileUser | null>(null);
  const [profiles, setProfiles] = useState<ProfileUser[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deskSharingEnabled, setDeskSharingEnabled] = useState(false);
  const [showDeskView, setShowDeskView] = useState(false);

  // Compute user statuses from work_schedules, vacations, sick_leaves
  const [userStatuses, setUserStatuses] = useState<Record<string, "office" | "remote" | "vacation" | "sick" | "day_off">>({});
  const [userSchedules, setUserSchedules] = useState<Record<string, Record<string, string>>>({});
  const [userVacations, setUserVacations] = useState<Record<string, { start: string; end: string }[]>>({});
  const [userSickLeaves, setUserSickLeaves] = useState<Record<string, { start: string; end: string }[]>>({});

  const companyId = membership?.company_id;

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      setLoading(true);
      // First get all approved company members
      const { data: members } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("status", "approved");

      const memberUserIds = (members || []).map(m => m.user_id);

      const [profilesRes, teamsRes, schedulesRes, vacationsRes, sickRes, companyRes] = await Promise.all([
        supabase.from("profiles").select("id, user_id, first_name, last_name, middle_name, position, team, phone, messenger, city, birthday, desk, avatar_url").in("user_id", memberUserIds),
        supabase.from("teams").select("id, name").eq("company_id", companyId).order("created_at"),
        supabase.from("work_schedules").select("*").eq("company_id", companyId),
        supabase.from("vacations").select("*").eq("company_id", companyId),
        supabase.from("sick_leaves").select("*").eq("company_id", companyId),
        supabase.from("companies").select("desk_sharing_enabled").eq("id", companyId).single(),
      ]);

      setProfiles(profilesRes.data || []);
      setTeams(teamsRes.data || []);
      setDeskSharingEnabled(companyRes.data?.desk_sharing_enabled || false);

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const dayIndex = (today.getDay() + 6) % 7; // Mon=0
      const dayKey = dayKeys[dayIndex];

      const schedMap: Record<string, Record<string, string>> = {};
      const statuses: Record<string, "office" | "remote" | "vacation" | "sick"> = {};

      for (const s of schedulesRes.data || []) {
        schedMap[s.user_id] = {};
        for (const k of dayKeys) schedMap[s.user_id][k] = (s as any)[k] || "office";
        const todayVal = (s as any)[dayKey] || "office";
        statuses[s.user_id] = todayVal === "day_off" ? "day_off" : todayVal;
      }
      setUserSchedules(schedMap);

      const vacMap: Record<string, { start: string; end: string }[]> = {};
      for (const v of vacationsRes.data || []) {
        if (!vacMap[v.user_id]) vacMap[v.user_id] = [];
        vacMap[v.user_id].push({ start: v.start_date, end: v.end_date });
        if (v.start_date <= todayStr && v.end_date >= todayStr) statuses[v.user_id] = "vacation";
      }
      setUserVacations(vacMap);

      const sickMap: Record<string, { start: string; end: string }[]> = {};
      for (const s of sickRes.data || []) {
        if (!sickMap[s.user_id]) sickMap[s.user_id] = [];
        sickMap[s.user_id].push({ start: s.start_date, end: s.end_date });
        if (s.start_date <= todayStr && s.end_date >= todayStr) statuses[s.user_id] = "sick";
      }
      setUserSickLeaves(sickMap);
      setUserStatuses(statuses);
      setLoading(false);
    };
    fetch();
  }, [companyId]);

  const getStatus = (userId: string) => userStatuses[userId] || "office";

  const filteredUsers = profiles.filter((u) => {
    if (selectedTeam !== "all" && u.team !== selectedTeam) return false;
    if (statusFilter !== "all" && getStatus(u.user_id) !== statusFilter) return false;
    return true;
  });

  const getTeamCount = (team: string) => {
    if (team === "all") return profiles.length;
    return profiles.filter((u) => u.team === team).length;
  };

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "office", label: "Офис" },
    { id: "remote", label: "Удалённо" },
    { id: "day_off", label: "Выходной" },
    { id: "vacation", label: "Отпуск" },
    { id: "sick", label: "Больничный" },
  ];

  // Convert ProfileUser to MockUser-like for UserCardModal
  const toMockUser = (u: ProfileUser) => ({
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    middleName: u.middle_name || undefined,
    position: u.position || "",
    team: u.team || "",
    status: getStatus(u.user_id),
    phone: u.phone || "",
    messenger: u.messenger || "",
    city: u.city || "",
    birthday: u.birthday || "",
    desk: u.desk || "",
    avatar: u.avatar_url || undefined,
    schedule: userSchedules[u.user_id] || {},
    vacations: userVacations[u.user_id] || [],
    sickLeaves: userSickLeaves[u.user_id] || [],
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (showDeskView) {
    return <DeskSharingView onBack={() => setShowDeskView(false)} />;
  }

  const teamTabs = ["all", ...teams.map(t => t.name)];

  return (
    <div className="h-full flex flex-col">
      {/* Team tabs + Desk button */}
      <div className="shrink-0 border-b border-border bg-card/50 px-4 pt-3 pb-0 overflow-x-auto">
        <div className="flex gap-1 min-w-max items-center">
          {teamTabs.map((team) => (
            <button
              key={team}
              onClick={() => setSelectedTeam(team)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                selectedTeam === team
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {team === "all" ? "Все" : team}
              <span className="ml-1.5 text-xs bg-secondary px-1.5 py-0.5 rounded-full">
                {getTeamCount(team)}
              </span>
            </button>
          ))}
          {deskSharingEnabled && (
            <button onClick={() => setShowDeskView(true)}
              className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-accent hover:text-accent/80 transition-all whitespace-nowrap flex items-center gap-1.5 ml-2">
              <Monitor className="w-3.5 h-3.5" />
              Рассадка
            </button>
          )}
        </div>
      </div>

      {/* Status filters */}
      <div className="shrink-0 px-4 py-3 flex gap-2 overflow-x-auto">
        {statusFilters.map((sf) => {
          const Icon = sf.id !== "all" ? statusIcons[sf.id] : UsersIcon;
          const count = profiles.filter((u) => {
            if (selectedTeam !== "all" && u.team !== selectedTeam) return false;
            if (sf.id !== "all" && getStatus(u.user_id) !== sf.id) return false;
            return true;
          }).length;
          return (
            <button
              key={sf.id}
              onClick={() => setStatusFilter(sf.id)}
              className={`status-badge transition-all whitespace-nowrap ${
                statusFilter === sf.id
                  ? sf.id === "all"
                    ? "bg-primary text-primary-foreground"
                    : `${statusColors[sf.id]} text-accent-foreground`
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {sf.label}
              <span className="text-[10px] opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid gap-2">
          {filteredUsers.map((user, i) => {
            const status = getStatus(user.user_id);
            const StatusIcon = statusIcons[status];
            return (
              <motion.button
                key={user.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedUser(user)}
                className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-accent/30 hover:shadow-sm transition-all text-left w-full"
              >
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-mono font-bold text-foreground shrink-0">
                    {user.first_name[0]}{user.last_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.last_name} {user.first_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.position || "—"} · {user.team || "—"}
                  </p>
                </div>
                <div className={`status-badge ${statusColors[status]} text-accent-foreground`}>
                  <StatusIcon className="w-3 h-3" />
                  <span className="hidden sm:inline">{statusLabels[status]}</span>
                </div>
              </motion.button>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <UsersIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Нет пользователей с выбранным фильтром</p>
            </div>
          )}
        </div>
      </div>

      {selectedUser && (
        <UserCardModal user={toMockUser(selectedUser)} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default TeamView;
