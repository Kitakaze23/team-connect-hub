import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, ArrowLeft, Loader2, Users, Check, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GroupSettingsDialog from "./GroupSettingsDialog";
import CallButtons from "@/components/call/CallButtons";
import { useUserCard } from "@/hooks/useUserCard";
import UserCardModal from "@/components/UserCardModal";
import ChatMessageBubble from "./ChatMessageBubble";
import ChatMessageInput from "./ChatMessageInput";

interface GroupConversation {
  id: string;
  name: string;
  member_count: number;
}

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

interface Contact {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface CallTarget {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

const GroupsTab = () => {
  const { user, membership } = useAuth();
  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const { cardUser, openCard, closeCard } = useUserCard();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupCallTargets, setGroupCallTargets] = useState<CallTarget[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!membership || !user) return;
    const fetchGroups = async () => {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, name")
        .eq("company_id", membership.company_id)
        .eq("type", "group");

      if (!convs || convs.length === 0) { setLoading(false); return; }

      const convIds = convs.map(c => c.id);
      const { data: members } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", convIds);

      const myConvIds = new Set(members?.filter(m => m.user_id === user.id).map(m => m.conversation_id) || []);
      const memberCounts = new Map<string, number>();
      members?.forEach(m => { memberCounts.set(m.conversation_id, (memberCounts.get(m.conversation_id) || 0) + 1); });

      const result: GroupConversation[] = convs
        .filter(c => myConvIds.has(c.id))
        .map(c => ({ id: c.id, name: c.name || "Группа", member_count: memberCounts.get(c.id) || 0 }));

      setGroups(result);
      setLoading(false);
    };
    fetchGroups();
  }, [membership, user]);

  useEffect(() => {
    if (!activeGroup) return;

    const fetchCallTargets = async () => {
      if (!user) return;

      const { data: members } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", activeGroup.id)
        .neq("user_id", user.id);

      const memberIds = members?.map((m) => m.user_id) || [];
      if (memberIds.length === 0) {
        setGroupCallTargets([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, avatar_url")
        .in("user_id", memberIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
      const targets: CallTarget[] = memberIds.map((memberId) => {
        const profile = profileMap.get(memberId);
        const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

        return {
          userId: memberId,
          name: fullName || "Участник",
          avatarUrl: profile?.avatar_url || null,
        };
      });

      setGroupCallTargets(targets);
    };

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, text, user_id, pinned, created_at, file_url, file_type")
        .eq("conversation_id", activeGroup.id)
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
      } else {
        setMessages([]);
      }
    };

    fetchCallTargets();
    fetchMessages();

    const channel = supabase
      .channel(`group-${activeGroup.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeGroup.id}` },
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
  }, [activeGroup, user]);

  const loadContacts = async () => {
    if (!membership) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, avatar_url")
      .eq("company_id", membership.company_id)
      .neq("user_id", user!.id);
    setContacts(data || []);
  };

  const toggleUser = (userId: string) => {
    const next = new Set(selectedUsers);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setSelectedUsers(next);
  };

  const createGroup = async () => {
    if (!groupName.trim() || !user || !membership) return;
    setCreating(true);

    const { data: conv } = await supabase
      .from("conversations")
      .insert({ company_id: membership.company_id, type: "group", name: groupName.trim(), created_by: user.id })
      .select("id")
      .single();

    if (!conv) { setCreating(false); return; }

    const memberInserts = [{ conversation_id: conv.id, user_id: user.id }];
    selectedUsers.forEach(uid => memberInserts.push({ conversation_id: conv.id, user_id: uid }));
    await supabase.from("conversation_members").insert(memberInserts);

    const newGroup: GroupConversation = { id: conv.id, name: groupName.trim(), member_count: memberInserts.length };
    setGroups(prev => [...prev, newGroup]);
    setDialogOpen(false);
    setGroupName("");
    setSelectedUsers(new Set());
    setCreating(false);
  };

  const filteredContacts = contacts.filter(c => {
    if (!contactSearch) return true;
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(contactSearch.toLowerCase());
  });

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;
  }

  if (activeGroup) {
    return (
      <>
        <div className="shrink-0 border-b border-border bg-card/50 px-4 py-2 flex items-center gap-3">
          <button onClick={() => { setActiveGroup(null); setMessages([]); setGroupCallTargets([]); }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Users className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-medium text-foreground">{activeGroup.name}</span>
            <span className="text-xs text-muted-foreground ml-2">{activeGroup.member_count} уч.</span>
          </div>
          <CallButtons conversationId={activeGroup.id} targetUsers={groupCallTargets} isGroup />
          <button onClick={() => setSettingsOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
        <GroupSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          group={activeGroup}
          onGroupDeleted={(id) => {
            setGroups(prev => prev.filter(g => g.id !== id));
            setActiveGroup(null);
            setMessages([]);
            setGroupCallTargets([]);
          }}
          onGroupUpdated={(id, name, count) => {
            setGroups(prev => prev.map(g => g.id === id ? { ...g, name, member_count: count } : g));
            setActiveGroup(prev => prev ? { ...prev, member_count: count } : prev);
          }}
        />
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
        <ChatMessageInput conversationId={activeGroup.id} />
        {cardUser && <UserCardModal user={cardUser} onClose={closeCard} />}
      </>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) { loadContacts(); setGroupName(""); setSelectedUsers(new Set()); setContactSearch(""); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full mb-2">
            <Plus className="w-4 h-4 mr-1.5" /> Создать группу
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">Новая группа</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Название группы</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Введите название..." className="h-9 bg-secondary/50" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Участники ({selectedUsers.size})</Label>
              <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Поиск..."
                className="w-full bg-secondary rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30 mt-1 mb-2" />
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredContacts.map((c) => (
                  <button key={c.user_id} onClick={() => toggleUser(c.user_id)}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-colors w-full text-left ${
                      selectedUsers.has(c.user_id) ? "bg-accent/10" : "hover:bg-secondary"
                    }`}>
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground">
                        {c.first_name?.[0]}{c.last_name?.[0]}
                      </div>
                    )}
                    <span className="text-sm text-foreground flex-1">{c.first_name} {c.last_name}</span>
                    {selectedUsers.has(c.user_id) && <Check className="w-4 h-4 text-accent" />}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={createGroup} disabled={!groupName.trim() || creating} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Создать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {groups.map((group) => (
        <motion.button key={group.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => setActiveGroup(group)}
          className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-accent/30 transition-all w-full text-left">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{group.name}</p>
            <p className="text-xs text-muted-foreground">{group.member_count} участников</p>
          </div>
        </motion.button>
      ))}

      {groups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Нет групп. Создайте первую!</div>
      )}
    </div>
  );
};

export default GroupsTab;
