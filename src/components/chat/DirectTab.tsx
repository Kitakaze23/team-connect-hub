import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Plus, ArrowLeft, Loader2, Pin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DirectConversation {
  id: string;
  other_user_id: string;
  other_first_name: string;
  other_last_name: string;
  other_avatar_url: string | null;
  last_message?: string;
}

interface Message {
  id: string;
  text: string;
  user_id: string;
  pinned: boolean;
  created_at: string;
}

interface Contact {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

const DirectTab = () => {
  const { user, membership } = useAuth();
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [activeConv, setActiveConv] = useState<DirectConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load DM conversations
  useEffect(() => {
    if (!membership || !user) return;
    const fetchDMs = async () => {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq("company_id", membership.company_id)
        .eq("type", "direct");

      if (!convs || convs.length === 0) { setLoading(false); return; }

      const convIds = convs.map(c => c.id);
      const { data: members } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", convIds);

      if (!members) { setLoading(false); return; }

      // Find DMs where I'm a member
      const myConvIds = new Set(members.filter(m => m.user_id === user.id).map(m => m.conversation_id));
      const otherMembers = members.filter(m => myConvIds.has(m.conversation_id) && m.user_id !== user.id);

      const otherUserIds = otherMembers.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, avatar_url")
        .in("user_id", otherUserIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const result: DirectConversation[] = otherMembers.map(m => {
        const p = profileMap.get(m.user_id);
        return {
          id: m.conversation_id,
          other_user_id: m.user_id,
          other_first_name: p?.first_name || "",
          other_last_name: p?.last_name || "",
          other_avatar_url: p?.avatar_url || null,
        };
      });

      setConversations(result);
      setLoading(false);
    };
    fetchDMs();
  }, [membership, user]);

  // Load messages when activeConv changes
  useEffect(() => {
    if (!activeConv) return;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, text, user_id, pinned, created_at")
        .eq("conversation_id", activeConv.id)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages(data || []);
    };
    fetchMessages();

    const channel = supabase
      .channel(`dm-${activeConv.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeConv.id}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConv]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv || !user) return;
    const text = newMessage.trim();
    setNewMessage("");
    await supabase.from("messages").insert({ conversation_id: activeConv.id, user_id: user.id, text });
  };

  const loadContacts = async () => {
    if (!membership) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, avatar_url")
      .eq("company_id", membership.company_id)
      .neq("user_id", user!.id);
    setContacts(data || []);
  };

  const startDM = async (contact: Contact) => {
    if (!user || !membership) return;
    // Check if DM already exists
    const existing = conversations.find(c => c.other_user_id === contact.user_id);
    if (existing) {
      setActiveConv(existing);
      setDialogOpen(false);
      return;
    }

    // Create DM conversation
    const { data: conv } = await supabase
      .from("conversations")
      .insert({ company_id: membership.company_id, type: "direct", name: null, created_by: user.id })
      .select("id")
      .single();

    if (!conv) return;

    await supabase.from("conversation_members").insert([
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: contact.user_id },
    ]);

    const newConv: DirectConversation = {
      id: conv.id,
      other_user_id: contact.user_id,
      other_first_name: contact.first_name,
      other_last_name: contact.last_name,
      other_avatar_url: contact.avatar_url,
    };
    setConversations(prev => [...prev, newConv]);
    setActiveConv(newConv);
    setDialogOpen(false);
  };

  const filteredContacts = contacts.filter(c => {
    if (!contactSearch) return true;
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(contactSearch.toLowerCase());
  });

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;
  }

  // Chat view
  if (activeConv) {
    return (
      <>
        <div className="shrink-0 border-b border-border bg-card/50 px-4 py-2 flex items-center gap-3">
          <button onClick={() => { setActiveConv(null); setMessages([]); }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {activeConv.other_avatar_url ? (
            <img src={activeConv.other_avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground">
              {activeConv.other_first_name?.[0]}{activeConv.other_last_name?.[0]}
            </div>
          )}
          <span className="text-sm font-medium text-foreground">{activeConv.other_first_name} {activeConv.other_last_name}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {messages.map((msg) => {
            const isOwn = msg.user_id === user?.id;
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                <div className={`max-w-[75%]`}>
                  <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "justify-end" : ""}`}>
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
            <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Написать сообщение..."
              className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30 transition-all" />
            <button type="submit" disabled={!newMessage.trim()}
              className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </>
    );
  }

  // Conversation list
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) loadContacts(); }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full mb-2">
            <Plus className="w-4 h-4 mr-1.5" /> Новый диалог
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Выберите контакт</DialogTitle>
          </DialogHeader>
          <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Поиск..."
            className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30 mb-2" />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredContacts.map((c) => (
              <button key={c.user_id} onClick={() => startDM(c)}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors w-full text-left">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground">
                    {c.first_name?.[0]}{c.last_name?.[0]}
                  </div>
                )}
                <span className="text-sm text-foreground">{c.first_name} {c.last_name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {conversations.map((conv) => (
        <motion.button key={conv.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => setActiveConv(conv)}
          className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-accent/30 transition-all w-full text-left">
          {conv.other_avatar_url ? (
            <img src={conv.other_avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-mono font-bold text-foreground shrink-0">
              {conv.other_first_name?.[0]}{conv.other_last_name?.[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{conv.other_first_name} {conv.other_last_name}</p>
          </div>
        </motion.button>
      ))}

      {conversations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Нет личных диалогов</div>
      )}
    </div>
  );
};

export default DirectTab;
