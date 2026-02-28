import { useState } from "react";
import { MessageSquare, User, Users as UsersIcon, BookUser } from "lucide-react";
import GeneralChat from "./GeneralChat";
import ContactsTab from "./ContactsTab";
import DirectTab from "./DirectTab";
import GroupsTab from "./GroupsTab";

type ChatTab = "general" | "direct" | "groups" | "contacts";

const ChatView = () => {
  const [chatTab, setChatTab] = useState<ChatTab>("general");

  const tabs = [
    { id: "general" as ChatTab, label: "Общий", icon: MessageSquare },
    { id: "direct" as ChatTab, label: "Личные", icon: User },
    { id: "groups" as ChatTab, label: "Группы", icon: UsersIcon },
    { id: "contacts" as ChatTab, label: "Контакты", icon: BookUser },
  ];

  return (
    <div className="h-full flex flex-col">
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

      {chatTab === "general" && <GeneralChat />}
      {chatTab === "direct" && <DirectTab />}
      {chatTab === "groups" && <GroupsTab />}
      {chatTab === "contacts" && <ContactsTab />}
    </div>
  );
};

export default ChatView;
