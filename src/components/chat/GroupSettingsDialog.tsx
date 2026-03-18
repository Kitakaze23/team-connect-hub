import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, UserMinus, Trash2, Check, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Member {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface GroupSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: { id: string; name: string; member_count: number } | null;
  onGroupDeleted: (groupId: string) => void;
  onGroupUpdated: (groupId: string, name: string, memberCount: number) => void;
}

const GroupSettingsDialog = ({ open, onOpenChange, group, onGroupDeleted, onGroupUpdated }: GroupSettingsDialogProps) => {
  const { user, membership } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [allContacts, setAllContacts] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !group) return;
    setShowAddMembers(false);
    setSearch("");
    loadMembers();
  }, [open, group]);

  const loadMembers = async () => {
    if (!group) return;
    setLoading(true);
    const { data: memberRows } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", group.id);

    if (memberRows && memberRows.length > 0) {
      const userIds = memberRows.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, avatar_url")
        .in("user_id", userIds);
      setMembers(profiles || []);
    } else {
      setMembers([]);
    }
    setLoading(false);
  };

  const loadContacts = async () => {
    if (!membership) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, avatar_url")
      .eq("company_id", membership.company_id);
    setAllContacts(data || []);
    setShowAddMembers(true);
  };

  const memberIds = new Set(members.map(m => m.user_id));

  const nonMembers = allContacts.filter(c => {
    if (memberIds.has(c.user_id)) return false;
    if (!search) return true;
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase());
  });

  const addMember = async (userId: string) => {
    if (!group) return;
    setAdding(userId);
    await supabase.from("conversation_members").insert({ conversation_id: group.id, user_id: userId });
    const added = allContacts.find(c => c.user_id === userId);
    if (added) setMembers(prev => [...prev, added]);
    onGroupUpdated(group.id, group.name, members.length + 1);
    setAdding(null);
  };

  const removeMember = async (userId: string) => {
    if (!group || userId === user?.id) return;
    setRemoving(userId);
    await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", group.id)
      .eq("user_id", userId);
    setMembers(prev => prev.filter(m => m.user_id !== userId));
    onGroupUpdated(group.id, group.name, members.length - 1);
    setRemoving(null);
  };

  const deleteGroup = async () => {
    if (!group) return;
    setDeleting(true);
    // Delete messages, members, then conversation
    await supabase.from("messages").delete().eq("conversation_id", group.id);
    await supabase.from("conversation_members").delete().eq("conversation_id", group.id);
    await supabase.from("conversations").delete().eq("id", group.id);
    onGroupDeleted(group.id);
    setDeleting(false);
    onOpenChange(false);
  };

  const Initials = ({ member }: { member: Member }) => (
    member.avatar_url ? (
      <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
    ) : (
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground">
        {member.first_name?.[0]}{member.last_name?.[0]}
      </div>
    )
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">Настройки группы</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Название</Label>
              <p className="text-sm font-medium text-foreground mt-0.5">{group?.name}</p>
            </div>

            {/* Current members */}
            <div>
              <Label className="text-xs text-muted-foreground">Участники ({members.length})</Label>
              <div className="space-y-1 max-h-40 overflow-y-auto mt-1">
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg">
                    <Initials member={m} />
                    <span className="text-sm text-foreground flex-1">
                      {m.first_name} {m.last_name}
                      {m.user_id === user?.id && <span className="text-xs text-muted-foreground ml-1">(вы)</span>}
                    </span>
                    {m.user_id !== user?.id && (
                      <button onClick={() => removeMember(m.user_id)} disabled={removing === m.user_id}
                        className="text-destructive hover:text-destructive/80 transition-colors p-1">
                        {removing === m.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Add members section */}
            {!showAddMembers ? (
              <Button variant="outline" size="sm" className="w-full" onClick={loadContacts}>
                <UserPlus className="w-4 h-4 mr-1.5" /> Добавить участников
              </Button>
            ) : (
              <div>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..."
                    className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30" />
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {nonMembers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Нет доступных контактов</p>
                  )}
                  {nonMembers.map(c => (
                    <button key={c.user_id} onClick={() => addMember(c.user_id)} disabled={adding === c.user_id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors w-full text-left">
                      <Initials member={c} />
                      <span className="text-sm text-foreground flex-1">{c.first_name} {c.last_name}</span>
                      {adding === c.user_id ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <UserPlus className="w-4 h-4 text-accent" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Delete group */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full" disabled={deleting}>
                  {deleting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
                  Удалить группу
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить группу?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Группа «{group?.name}» и все сообщения будут удалены безвозвратно.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteGroup}>Удалить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GroupSettingsDialog;
