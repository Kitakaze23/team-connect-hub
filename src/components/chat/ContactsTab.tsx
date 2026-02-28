import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, Phone, MessageCircle, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Contact {
  user_id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  team: string | null;
  phone: string | null;
  messenger: string | null;
  city: string | null;
  avatar_url: string | null;
}

const ContactsTab = () => {
  const { membership } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!membership) return;
    const fetchContacts = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, position, team, phone, messenger, city, avatar_url")
        .eq("company_id", membership.company_id);
      setContacts(data || []);
      setLoading(false);
    };
    fetchContacts();
  }, [membership]);

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${c.first_name} ${c.last_name} ${c.position || ""} ${c.team || ""}`.toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск контактов..."
        className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30 transition-all mb-2"
      />
      {filtered.map((contact, i) => (
        <motion.div
          key={contact.user_id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.02 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border"
        >
          {contact.avatar_url ? (
            <img src={contact.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-mono font-bold text-foreground shrink-0">
              {contact.first_name?.[0]}{contact.last_name?.[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{contact.last_name} {contact.first_name}</p>
            <p className="text-xs text-muted-foreground truncate">{contact.position}{contact.team ? ` · ${contact.team}` : ""}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="text-muted-foreground hover:text-accent transition-colors">
                <Phone className="w-4 h-4" />
              </a>
            )}
            {contact.messenger && (
              <span className="text-muted-foreground" title={contact.messenger}>
                <MessageCircle className="w-4 h-4" />
              </span>
            )}
            {contact.city && (
              <span className="text-muted-foreground" title={contact.city}>
                <MapPin className="w-4 h-4" />
              </span>
            )}
          </div>
        </motion.div>
      ))}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Контакты не найдены</div>
      )}
    </div>
  );
};

export default ContactsTab;
