import { Phone, Video } from "lucide-react";
import { useCall, CallType } from "@/contexts/CallContext";

interface CallButtonsProps {
  conversationId: string;
  targetUsers: { userId: string; name: string; avatarUrl: string | null }[];
  isGroup?: boolean;
}

const CallButtons = ({ conversationId, targetUsers, isGroup = false }: CallButtonsProps) => {
  const { startCall, callState } = useCall();

  const handleCall = (type: CallType) => {
    if (callState !== "idle") return;
    startCall(conversationId, type, targetUsers, isGroup);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleCall("audio")}
        disabled={callState !== "idle"}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
        title="Аудиозвонок"
      >
        <Phone className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleCall("video")}
        disabled={callState !== "idle"}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
        title="Видеозвонок"
      >
        <Video className="w-4 h-4" />
      </button>
    </div>
  );
};

export default CallButtons;
