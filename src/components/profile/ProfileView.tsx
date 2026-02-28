import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Camera, Phone, MessageCircle, MapPin, Cake, Monitor,
  Building2, Wifi, Save, LogOut, Loader2, CalendarDays, Stethoscope
} from "lucide-react";
import WorkScheduleDialog from "./WorkScheduleDialog";
import PeriodDialog from "./PeriodDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const dayNames: Record<string, string> = {
  mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт",
};

const ProfileView = () => {
  const { user, signOut, membership } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [position, setPosition] = useState("");
  const [team, setTeam] = useState("");
  const [phone, setPhone] = useState("");
  const [messenger, setMessenger] = useState("");
  const [city, setCity] = useState("");
  const [birthday, setBirthday] = useState("");
  const [desk, setDesk] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [showVacation, setShowVacation] = useState(false);
  const [showSickLeave, setShowSickLeave] = useState(false);
  const [teamsList, setTeamsList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!membership?.company_id) return;
    supabase.from("teams").select("id, name").eq("company_id", membership.company_id).order("created_at").then(({ data }) => {
      setTeamsList(data || []);
    });
  }, [membership?.company_id]);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setMiddleName(data.middle_name || "");
        setPosition(data.position || "");
        setTeam(data.team || "");
        setPhone(data.phone || "");
        setMessenger(data.messenger || "");
        setCity(data.city || "");
        setBirthday(data.birthday || "");
        setDesk(data.desk || "");
        setAvatarUrl(data.avatar_url || "");
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName,
        position,
        team,
        phone,
        messenger,
        city,
        birthday: birthday || null,
        desk,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Сохранено", description: "Профиль обновлён" });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Ошибка загрузки", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;

    await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
    setAvatarUrl(url);
    setUploading(false);
    toast({ title: "Фото обновлено" });
  };

  const handleLogout = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

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
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-2xl object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center text-xl font-mono font-bold text-foreground">
                  {firstName?.[0] || ""}{lastName?.[0] || ""}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-2xl bg-foreground/0 group-hover:bg-foreground/20 flex items-center justify-center transition-all"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 text-primary-foreground animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Фамилия</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9 bg-secondary/50" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Имя</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9 bg-secondary/50" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Отчество</Label>
                  <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="h-9 bg-secondary/50" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Должность</Label>
                  <Input value={position} onChange={(e) => setPosition(e.target.value)} className="h-9 bg-secondary/50" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Команда</Label>
                  <Select value={team} onValueChange={setTeam}>
                    <SelectTrigger className="h-9 bg-secondary/50">
                      <SelectValue placeholder="Выберите команду" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Без команды</SelectItem>
                      {teamsList.map((t) => (
                        <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input value={messenger} onChange={(e) => setMessenger(e.target.value)} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <Cake className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="h-9 bg-secondary/50" />
            </div>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input value={desk} placeholder="Номер стола" onChange={(e) => setDesk(e.target.value)} className="h-9 bg-secondary/50" />
            </div>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Сохранить
          </Button>
        </motion.div>

        {/* Block 3: Schedule / Vacation / Sick leave */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <h3 className="text-sm font-mono font-semibold text-foreground mb-3">Расписание и отсутствия</h3>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setShowSchedule(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors"
            >
              <Building2 className="w-6 h-6 text-status-office" />
              <span className="text-xs font-medium text-foreground">Режим работы</span>
            </button>
            <button
              onClick={() => setShowVacation(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors"
            >
              <CalendarDays className="w-6 h-6 text-status-vacation" />
              <span className="text-xs font-medium text-foreground">Отпуск</span>
            </button>
            <button
              onClick={() => setShowSickLeave(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors"
            >
              <Stethoscope className="w-6 h-6 text-status-sick" />
              <span className="text-xs font-medium text-foreground">Больничный</span>
            </button>
          </div>
        </motion.div>

        <WorkScheduleDialog open={showSchedule} onOpenChange={setShowSchedule} />
        <PeriodDialog open={showVacation} onOpenChange={setShowVacation} title="Отпуска" table="vacations" />
        <PeriodDialog open={showSickLeave} onOpenChange={setShowSickLeave} title="Больничные" table="sick_leaves" />


        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Button variant="outline" onClick={handleLogout} className="w-full text-destructive border-destructive/30 hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" /> Выйти из аккаунта
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default ProfileView;
