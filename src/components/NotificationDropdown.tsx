import { useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Notification = {
  id: string;
  text: string;
  read: boolean;
  time: string;
};

const initialNotifications: Notification[] = [
  { id: "1", text: "Новое сообщение в общем чате", read: false, time: "09:15" },
  { id: "2", text: "Дмитрий Козлов ушёл в отпуск", read: false, time: "08:30" },
  { id: "3", text: "Артём Новиков на больничном", read: true, time: "Вчера" },
];

const NotificationDropdown = () => {
  const [notifications, setNotifications] = useState(initialNotifications);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = (id: string) => {
    setNotifications(notifications.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const clearAll = () => setNotifications([]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse-dot">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="text-sm font-mono font-semibold">Уведомления</h4>
          {notifications.length > 0 && (
            <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Очистить
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Нет уведомлений</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors ${
                  !n.read ? "bg-accent/5" : ""
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.read ? "bg-accent" : "bg-transparent"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{n.text}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.time}</p>
                </div>
                {!n.read && <Check className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationDropdown;
