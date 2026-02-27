import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Wifi, Palmtree, Stethoscope, Phone, MessageCircle, MapPin, Cake, Monitor, CalendarDays } from "lucide-react";
import { type MockUser, statusLabels, statusColors } from "@/lib/mockData";

const statusIcons = {
  office: Building2,
  remote: Wifi,
  vacation: Palmtree,
  sick: Stethoscope,
};

const dayNames: Record<string, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт",
};

interface Props {
  user: MockUser;
  onClose: () => void;
}

const UserCardModal = ({ user, onClose }: Props) => {
  const StatusIcon = statusIcons[user.status];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">Карточка сотрудника</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-lg font-mono font-bold text-foreground">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div>
              <p className="font-medium text-foreground">
                {user.lastName} {user.firstName} {user.middleName || ""}
              </p>
              <p className="text-sm text-muted-foreground">{user.position}</p>
              <div className={`status-badge mt-1 ${statusColors[user.status]} text-accent-foreground`}>
                <StatusIcon className="w-3 h-3" />
                {statusLabels[user.status]}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4" />
              <span className="text-foreground">{user.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageCircle className="w-4 h-4" />
              <span className="text-foreground">{user.messenger}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span className="text-foreground">{user.city}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cake className="w-4 h-4" />
              <span className="text-foreground">{user.birthday}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Monitor className="w-4 h-4" />
              <span className="text-foreground">Стол: {user.desk}</span>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <p className="text-xs font-mono font-medium text-muted-foreground mb-2">Режим работы</p>
            <div className="flex gap-1.5">
              {Object.entries(dayNames).map(([key, label]) => (
                <div key={key} className="text-center">
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${
                    user.schedule[key] === "office" ? "bg-status-office/15 text-status-office" : "bg-status-remote/15 text-status-remote"
                  }`}>
                    {user.schedule[key] === "office" ? <Building2 className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vacations */}
          {user.vacations.length > 0 && (
            <div>
              <p className="text-xs font-mono font-medium text-muted-foreground mb-1.5">Отпуска</p>
              {user.vacations.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-3.5 h-3.5 text-status-vacation" />
                  <span className="text-foreground">{v.start} — {v.end}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sick leaves */}
          {user.sickLeaves.length > 0 && (
            <div>
              <p className="text-xs font-mono font-medium text-muted-foreground mb-1.5">Больничные</p>
              {user.sickLeaves.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-3.5 h-3.5 text-status-sick" />
                  <span className="text-foreground">{s.start} — {s.end}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserCardModal;
