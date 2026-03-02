import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Wifi, Palmtree, Stethoscope, Phone, MessageCircle, MapPin, Cake, Monitor, CalendarDays, Coffee, Video, PhoneCall, Loader2 } from "lucide-react";
import { type MockUser, statusLabels, statusColors } from "@/lib/mockData";
import { useCall } from "@/contexts/CallContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const statusIcons = {
  office: Building2,
  remote: Wifi,
  vacation: Palmtree,
  sick: Stethoscope,
};

const dayNames: Record<string, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс",
};

interface Props {
  user: MockUser;
  onClose: () => void;
}

const UserCardModal = ({ user, onClose }: Props) => {
  const StatusIcon = statusIcons[user.status];
  const { startCall, callState } = useCall();
  const { user: currentUser, membership } = useAuth();
  const [callingType, setCallingType] = useState<"audio" | "video" | null>(null);

  const targetUserId = user.userId;
  const isSelf = currentUser?.id === targetUserId;

  const handleCall = async (type: "audio" | "video") => {
    if (!targetUserId || !currentUser || !membership || isSelf || callState !== "idle") return;
    setCallingType(type);

    try {
      // Find or create DM conversation
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", membership.company_id)
        .eq("type", "direct");

      let convId: string | null = null;

      if (convs) {
        for (const conv of convs) {
          const { data: members } = await supabase
            .from("conversation_members")
            .select("user_id")
            .eq("conversation_id", conv.id);
          const uids = members?.map(m => m.user_id) || [];
          if (uids.length === 2 && uids.includes(currentUser.id) && uids.includes(targetUserId)) {
            convId = conv.id;
            break;
          }
        }
      }

      if (!convId) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ company_id: membership.company_id, type: "direct", name: null, created_by: currentUser.id })
          .select("id")
          .single();
        if (!newConv) { setCallingType(null); return; }
        convId = newConv.id;
        await supabase.from("conversation_members").insert([
          { conversation_id: convId, user_id: currentUser.id },
          { conversation_id: convId, user_id: targetUserId },
        ]);
      }

      await startCall(convId, type, [{
        userId: targetUserId,
        name: `${user.firstName} ${user.lastName}`,
        avatarUrl: user.avatar || null,
      }], false);

      onClose();
    } catch {
      // ignore
    } finally {
      setCallingType(null);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">Карточка сотрудника</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-lg font-mono font-bold text-foreground">
                {user.firstName[0]}{user.lastName[0]}
              </div>
            )}
            <div className="flex-1">
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

          {/* Call buttons */}
          {targetUserId && !isSelf && (
            <div className="flex gap-2">
              <button
                onClick={() => handleCall("audio")}
                disabled={callState !== "idle" || !!callingType}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium disabled:opacity-40"
              >
                {callingType === "audio" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                Аудиозвонок
              </button>
              <button
                onClick={() => handleCall("video")}
                disabled={callState !== "idle" || !!callingType}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium disabled:opacity-40"
              >
                {callingType === "video" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                Видеозвонок
              </button>
            </div>
          )}

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
              {Object.entries(dayNames).map(([key, label]) => {
                const val = user.schedule[key] || "office";
                const isOffice = val === "office";
                const isRemote = val === "remote";
                return (
                  <div key={key} className="text-center">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${
                      isOffice ? "bg-status-office/15 text-status-office" :
                      isRemote ? "bg-status-remote/15 text-status-remote" :
                      "bg-muted/30 text-muted-foreground"
                    }`}>
                      {isOffice ? <Building2 className="w-3.5 h-3.5" /> :
                       isRemote ? <Wifi className="w-3.5 h-3.5" /> :
                       <Coffee className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
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
