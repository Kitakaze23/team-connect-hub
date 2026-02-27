import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Wifi, Palmtree, Stethoscope, Users as UsersIcon } from "lucide-react";
import { mockUsers, mockTeams, statusLabels, statusColors, type MockUser } from "@/lib/mockData";
import UserCardModal from "@/components/UserCardModal";

type StatusFilter = "all" | "office" | "remote" | "vacation" | "sick";

const statusIcons = {
  office: Building2,
  remote: Wifi,
  vacation: Palmtree,
  sick: Stethoscope,
};

const TeamView = () => {
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedUser, setSelectedUser] = useState<MockUser | null>(null);

  const teams = ["all", ...mockTeams];

  const filteredUsers = mockUsers.filter((u) => {
    if (selectedTeam !== "all" && u.team !== selectedTeam) return false;
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    return true;
  });

  const getTeamCount = (team: string) => {
    if (team === "all") return mockUsers.length;
    return mockUsers.filter((u) => u.team === team).length;
  };

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "office", label: "Офис" },
    { id: "remote", label: "Удалённо" },
    { id: "vacation", label: "Отпуск" },
    { id: "sick", label: "Больничный" },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Team tabs */}
      <div className="shrink-0 border-b border-border bg-card/50 px-4 pt-3 pb-0 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {teams.map((team) => (
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
        </div>
      </div>

      {/* Status filters */}
      <div className="shrink-0 px-4 py-3 flex gap-2 overflow-x-auto">
        {statusFilters.map((sf) => {
          const Icon = sf.id !== "all" ? statusIcons[sf.id] : UsersIcon;
          const count = mockUsers.filter((u) => {
            if (selectedTeam !== "all" && u.team !== selectedTeam) return false;
            if (sf.id !== "all" && u.status !== sf.id) return false;
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
            const StatusIcon = statusIcons[user.status];
            return (
              <motion.button
                key={user.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedUser(user)}
                className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-accent/30 hover:shadow-sm transition-all text-left w-full"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-mono font-bold text-foreground shrink-0">
                  {user.firstName[0]}{user.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.lastName} {user.firstName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user.position} · {user.team}
                  </p>
                </div>
                <div className={`status-badge ${statusColors[user.status]} text-accent-foreground`}>
                  <StatusIcon className="w-3 h-3" />
                  <span className="hidden sm:inline">{statusLabels[user.status]}</span>
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
        <UserCardModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default TeamView;
