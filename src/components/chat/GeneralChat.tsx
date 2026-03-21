import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useUserCard } from "@/hooks/useUserCard";
import UserCardModal from "@/components/UserCardModal";
import ChatMessageBubble from "./ChatMessageBubble";
import ChatMessageInput from "./ChatMessageInput";

interface Message {
  id: string;
  text: string;
  user_id: string;
  pinned: boolean;
  created_at: string;
  file_url?: string | null;
  file_type?: string | null;
  profile?: { first_name: string; last_name: string; avatar_url: string | null };
}

const GeneralChat = () => {
  const { user, membership } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { cardUser, openCard, closeCard } = useUserCard();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!membership) return;
    const init = async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", membership.company_id)
        .eq("type", "general")
        .maybeSingle();

      if (conv) {
        setConversationId(conv.id);
      } else {
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

  useEffect(() => {
    if (!conversationId) return;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, text, user_id, pinned, created_at, file_url, file_type")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (data && data.length > 0) {
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

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.user_id === user?.id}
            onAvatarClick={openCard}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {conversationId && <ChatMessageInput conversationId={conversationId} />}

      {cardUser && <UserCardModal user={cardUser} onClose={closeCard} />}
    </>
  );
};

export default GeneralChat;
