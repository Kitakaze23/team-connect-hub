import { motion } from "framer-motion";
import { Pin } from "lucide-react";

interface MessageData {
  id: string;
  text: string;
  user_id: string;
  pinned: boolean;
  created_at: string;
  file_url?: string | null;
  file_type?: string | null;
  profile?: { first_name: string; last_name: string; avatar_url: string | null };
}

interface ChatMessageBubbleProps {
  msg: MessageData;
  isOwn: boolean;
  showAuthor?: boolean;
  onAvatarClick?: (profile: { user_id: string; first_name: string; last_name: string; avatar_url: string | null }) => void;
}

const ChatMessageBubble = ({ msg, isOwn, showAuthor = true, onAvatarClick }: ChatMessageBubbleProps) => {
  const initials = msg.profile ? `${msg.profile.first_name?.[0] || ""}${msg.profile.last_name?.[0] || ""}` : "?";
  const displayName = msg.profile ? `${msg.profile.first_name} ${msg.profile.last_name?.[0]}.` : "Unknown";

  const handleClick = () => {
    if (msg.profile && onAvatarClick) {
      onAvatarClick({ user_id: msg.user_id, first_name: msg.profile.first_name, last_name: msg.profile.last_name, avatar_url: msg.profile.avatar_url });
    }
  };

  const renderFileContent = () => {
    if (!msg.file_url) return null;
    if (msg.file_type === "video") {
      return <video src={msg.file_url} controls className="max-w-full rounded-lg mt-1 max-h-64" />;
    }
    return <img src={msg.file_url} alt="" className="max-w-full rounded-lg mt-1 max-h-64 object-cover cursor-pointer" onClick={() => window.open(msg.file_url!, "_blank")} />;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      {showAuthor && (
        msg.profile?.avatar_url ? (
          <button onClick={handleClick} className="shrink-0">
            <img src={msg.profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-accent/40 transition-all" />
          </button>
        ) : (
          <button onClick={handleClick} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0 cursor-pointer hover:ring-2 hover:ring-accent/40 transition-all">
            {initials}
          </button>
        )
      )}
      <div className={`max-w-[75%] ${isOwn ? "items-end" : ""}`}>
        <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "justify-end" : ""}`}>
          {showAuthor && (
            <button onClick={handleClick} className="text-xs font-medium text-foreground hover:text-accent transition-colors cursor-pointer">{displayName}</button>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {msg.pinned && <Pin className="w-3 h-3 text-accent" />}
        </div>
        <div className={`px-3 py-2 rounded-2xl text-sm ${
          isOwn ? "bg-primary text-primary-foreground rounded-tr-md" : "bg-card border border-border rounded-tl-md"
        }`}>
          {(!msg.file_url || (msg.text && msg.text !== "📷 Фото" && msg.text !== "🎥 Видео")) && msg.text}
          {renderFileContent()}
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessageBubble;
