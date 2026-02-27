import { useState } from "react";
import { Search, X } from "lucide-react";
import { mockUsers } from "@/lib/mockData";
import UserCardModal from "@/components/UserCardModal";
import type { MockUser } from "@/lib/mockData";

const GlobalSearch = () => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MockUser | null>(null);

  const results = query.trim()
    ? mockUsers.filter((u) => {
        const q = query.toLowerCase();
        return (
          u.firstName.toLowerCase().includes(q) ||
          u.lastName.toLowerCase().includes(q) ||
          u.position.toLowerCase().includes(q) ||
          u.team.toLowerCase().includes(q) ||
          (u.middleName?.toLowerCase().includes(q) ?? false)
        );
      })
    : [];

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors sm:w-auto sm:px-3 sm:gap-2"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline text-sm text-muted-foreground">Поиск...</span>
        </button>

        {open && (
          <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
            <div className="w-full max-w-md mx-4 bg-card rounded-2xl border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по имени, должности, команде..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <button onClick={() => { setQuery(""); setOpen(false); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {results.length > 0 && (
                <div className="max-h-64 overflow-y-auto py-1">
                  {results.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => { setSelectedUser(user); setOpen(false); setQuery(""); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground">
                        {user.firstName[0]}{user.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{user.lastName} {user.firstName}</p>
                        <p className="text-xs text-muted-foreground">{user.position} · {user.team}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {query.trim() && results.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">Ничего не найдено</p>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedUser && (
        <UserCardModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </>
  );
};

export default GlobalSearch;
