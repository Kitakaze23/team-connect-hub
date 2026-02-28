import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Pin, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  text: string;
  user_id: string;
  pinned: boolean;
  created_at: string;
  profile?: { first_name: string; last_name: string; avatar_url: string | null };
}

const GeneralChat = () => {
  const { user, membership } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get or create the general conversation
  useEffect(() => {
    if (!membership) return;
    const init = async () => {
      // Find general conversation
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", membership.company_id)
        .eq("type", "general")
        .maybeSingle();

      if (conv) {
        setConversationId(conv.id);
      } else {
        // Create it
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ company_id: membership.company_id, type: "general", name: "Общий чат", created_by: user!.id })
          .select("id")
          .single();
        if (newConv) setConversationId(newConv.id);
      }
    };
    init();
  }, [membership]);

  // Fetch messages
  useEffect(() => {
    if (!conversationId) return;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, text, user_id, pinned, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (data && data.length > 0) {
        // Fetch profiles for message authors
        const userIds = [...new Set(data.map(m => m.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, avatar_url")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
        setMessages(data.map(m => ({ ...m, profile: profileMap.get(m.user_id) as any })));
      }
      setLoading(false);
    };
    fetchMessages();

    // Realtime
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const msg = payload.new as any;
          const { data: prof } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, avatar_url")
            .eq("user_id", msg.user_id)
            .maybeSingle();
          setMessages(prev => [...prev, { ...msg, profile: prof }]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !conversationId || !user) return;
    const text = newMessage.trim();
    setNewMessage("");
    await supabase.from("messages").insert({ conversation_id: conversationId, user_id: user.id, text });
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg) => {
          const isOwn = msg.user_id === user?.id;
          const initials = msg.profile ? `${msg.profile.first_name?.[0] || ""}${msg.profile.last_name?.[0] || ""}` : "?";
          const displayName = msg.profile ? `${msg.profile.first_name} ${msg.profile.last_name?.[0]}.` : "Unknown";
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}
            >
              {msg.profile?.avatar_url ? (
                <img src={msg.profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0">
                  {initials}
                </div>
              )}
              <div className={`max-w-[75%] ${isOwn ? "items-end" : ""}`}>
                <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "justify-end" : ""}`}>
                  <span className="text-xs font-medium text-foreground">{displayName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {msg.pinned && <Pin className="w-3 h-3 text-accent" />}
                </div>
                <div className={`px-3 py-2 rounded-2xl text-sm ${
                  isOwn ? "bg-primary text-primary-foreground rounded-tr-md" : "bg-card border border-border rounded-tl-md"
                }`}>
                  {msg.text}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="shrink-0 border-t border-border bg-card/80 backdrop-blur-md p-3">
        <div className="flex gap-2 items-center">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Написать сообщение..."
            className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30 transition-all"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </>
  );
};

export default GeneralChat;
