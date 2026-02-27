import { useState } from "react";
import { motion } from "framer-motion";
import {
  Camera, Phone, MessageCircle, MapPin, Cake, Monitor,
  Building2, Wifi, Palmtree, Stethoscope, Save, Plus, Trash2, CalendarDays
} from "lucide-react";
import { mockUsers, mockTeams, statusLabels } from "@/lib/mockData";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const currentUser = mockUsers[0]; // Mock current user

const dayNames: Record<string, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт",
};

const ProfileView = () => {
  const [user, setUser] = useState(currentUser);
  const [schedule, setSchedule] = useState(user.schedule);
  const [vacations, setVacations] = useState(user.vacations);
  const [sickLeaves, setSickLeaves] = useState(user.sickLeaves);
  const { toast } = useToast();

  const handleSave = (section: string) => {
    toast({ title: "Сохранено", description: `${section} обновлён` });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8">
        {/* Photo & name */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <div className="flex items-start gap-4">
            <div className="relative group">
              <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center text-xl font-mono font-bold text-foreground">
                {user.firstName[0]}{user.lastName[0]}
              </div>
              <button className="absolute inset-0 rounded-2xl bg-foreground/0 group-hover:bg-foreground/20 flex items-center justify-center transition-all">
                <Camera className="w-5 h-5 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Фамилия</Label>
                  <Input value={user.lastName} onChange={(e) => setUser({...user, lastName: e.target.value})} className="h-9 bg-secondary/50" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Имя</Label>
                  <Input value={user.firstName} onChange={(e) => setUser({...user, firstName: e.target.value})} className="h-9 bg-secondary/50" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Отчество</Label>
                  <Input value={user.middleName || ""} onChange={(e) => setUser({...user, middleName: e.target.value})} className="h-9 bg-secondary/50" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Должность</Label>
                  <Input value={user.position} onChange={(e) => setUser({...user, position: e.target.value})} className="h-9 bg-secondary/50" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Команда</Label>
                  <select
                    value={user.team}
                    onChange={(e) => setUser({...user, team: e.target.value})}
                    className="h-9 w-full rounded-md border border-input bg-secondary/50 px-3 text-sm"
                  >
                    {mockTeams.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Contact info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-3"
        >
          <h3 className="text-sm font-mono font-semibold text-foreground mb-3">Контакты</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input value={user.phone} onChange={(e) => setUser({...user, phone: e.target.value})} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input value={user.messenger} onChange={(e) => setUser({...user, messenger: e.target.value})} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input value={user.city} onChange={(e) => setUser({...user, city: e.target.value})} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <Cake className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input type="date" value={user.birthday} onChange={(e) => setUser({...user, birthday: e.target.value})} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input value={user.desk} placeholder="Номер стола" onChange={(e) => setUser({...user, desk: e.target.value})} className="h-9 bg-secondary/50" />
            </div>
          </div>
          <Button size="sm" onClick={() => handleSave("Контакты")} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Save className="w-3.5 h-3.5 mr-1.5" /> Сохранить
          </Button>
        </motion.div>

        {/* Schedule, Vacations, Sick leaves */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          {/* Work Schedule */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-accent/30 transition-all">
                <div className="w-10 h-10 rounded-xl bg-status-office/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-status-office" />
                </div>
                <span className="text-xs font-medium text-foreground">Режим</span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-mono">Режим работы</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {Object.entries(dayNames).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm font-medium w-8">{label}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSchedule({...schedule, [key]: "office"})}
                        className={`status-badge transition-all ${
                          schedule[key] === "office" ? "bg-status-office text-accent-foreground" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <Building2 className="w-3 h-3" /> Офис
                      </button>
                      <button
                        onClick={() => setSchedule({...schedule, [key]: "remote"})}
                        className={`status-badge transition-all ${
                          schedule[key] === "remote" ? "bg-status-remote text-accent-foreground" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        <Wifi className="w-3 h-3" /> Удалённо
                      </button>
                    </div>
                  </div>
                ))}
                <Button onClick={() => handleSave("Режим работы")} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Сохранить
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Vacation */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-accent/30 transition-all">
                <div className="w-10 h-10 rounded-xl bg-status-vacation/10 flex items-center justify-center">
                  <Palmtree className="w-5 h-5 text-status-vacation" />
                </div>
                <span className="text-xs font-medium text-foreground">Отпуск</span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-mono">Отпуска</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {vacations.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input type="date" value={v.start} onChange={(e) => {
                      const copy = [...vacations]; copy[i] = {...copy[i], start: e.target.value}; setVacations(copy);
                    }} className="h-9 bg-secondary/50" />
                    <span className="text-muted-foreground">—</span>
                    <Input type="date" value={v.end} onChange={(e) => {
                      const copy = [...vacations]; copy[i] = {...copy[i], end: e.target.value}; setVacations(copy);
                    }} className="h-9 bg-secondary/50" />
                    <button onClick={() => setVacations(vacations.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setVacations([...vacations, { start: "", end: "" }])}
                  className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80"
                >
                  <Plus className="w-4 h-4" /> Добавить отпуск
                </button>
                <Button onClick={() => handleSave("Отпуска")} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Сохранить
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Sick leave */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-accent/30 transition-all">
                <div className="w-10 h-10 rounded-xl bg-status-sick/10 flex items-center justify-center">
                  <Stethoscope className="w-5 h-5 text-status-sick" />
                </div>
                <span className="text-xs font-medium text-foreground">Больничный</span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-mono">Больничные</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {sickLeaves.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input type="date" value={s.start} onChange={(e) => {
                      const copy = [...sickLeaves]; copy[i] = {...copy[i], start: e.target.value}; setSickLeaves(copy);
                    }} className="h-9 bg-secondary/50" />
                    <span className="text-muted-foreground">—</span>
                    <Input type="date" value={s.end} onChange={(e) => {
                      const copy = [...sickLeaves]; copy[i] = {...copy[i], end: e.target.value}; setSickLeaves(copy);
                    }} className="h-9 bg-secondary/50" />
                    <button onClick={() => setSickLeaves(sickLeaves.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setSickLeaves([...sickLeaves, { start: "", end: "" }])}
                  className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80"
                >
                  <Plus className="w-4 h-4" /> Добавить больничный
                </button>
                <Button onClick={() => handleSave("Больничные")} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Сохранить
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>
      </div>
    </div>
  );
};

export default ProfileView;
