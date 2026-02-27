import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Pin, MessageSquare, User, Users as UsersIcon } from "lucide-react";
import { mockMessages, mockUsers, type ChatMessage } from "@/lib/mockData";
import UserCardModal from "@/components/UserCardModal";
import type { MockUser } from "@/lib/mockData";

type ChatTab = "general" | "direct" | "groups";

const ChatView = () => {
  const [chatTab, setChatTab] = useState<ChatTab>("general");
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
  const [newMessage, setNewMessage] = useState("");
  const [selectedUser, setSelectedUser] = useState<MockUser | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const msg: ChatMessage = {
      id: `m${Date.now()}`,
      userId: "1",
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages([...messages, msg]);
    setNewMessage("");
  };

  const getUserById = (id: string) => mockUsers.find((u) => u.id === id);

  const tabs = [
    { id: "general" as ChatTab, label: "Общий", icon: MessageSquare },
    { id: "direct" as ChatTab, label: "Личные", icon: User },
    { id: "groups" as ChatTab, label: "Группы", icon: UsersIcon },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Chat tabs */}
      <div className="shrink-0 border-b border-border bg-card/50 px-4 pt-3 pb-0">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setChatTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                chatTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {chatTab === "general" ? (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {messages.map((msg) => {
              const user = getUserById(msg.userId);
              const isOwn = msg.userId === "1";
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 ${isOwn ? "flex-row-reverse" : ""}`}
                >
                  <button
                    onClick={() => user && setSelectedUser(user)}
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-mono font-bold text-foreground shrink-0 hover:ring-2 hover:ring-accent/30 transition-all"
                  >
                    {user ? `${user.firstName[0]}${user.lastName[0]}` : "?"}
                  </button>
                  <div className={`max-w-[75%] ${isOwn ? "items-end" : ""}`}>
                    <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "justify-end" : ""}`}>
                      <button
                        onClick={() => user && setSelectedUser(user)}
                        className="text-xs font-medium text-foreground hover:text-accent transition-colors"
                      >
                        {user ? `${user.firstName} ${user.lastName[0]}.` : "Unknown"}
                      </button>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.pinned && <Pin className="w-3 h-3 text-accent" />}
                    </div>
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm ${
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-tr-md"
                          : "bg-card border border-border rounded-tl-md"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
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
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {chatTab === "direct" ? "Выберите пользователя для личной переписки" : "Создайте группу для общения"}
            </p>
          </div>
        </div>
      )}

      {selectedUser && (
        <UserCardModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default ChatView;
