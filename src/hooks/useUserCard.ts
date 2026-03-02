import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type MockUser } from "@/lib/mockData";

interface MinimalUser {
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export const useUserCard = () => {
  const [cardUser, setCardUser] = useState<MockUser | null>(null);

  const openCard = useCallback(async (u: MinimalUser) => {
    // Fetch full profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", u.user_id)
      .maybeSingle();

    if (!profile) return;

    // Fetch schedule
    const { data: schedule } = await supabase
      .from("work_schedules")
      .select("mon, tue, wed, thu, fri, sat, sun")
      .eq("user_id", u.user_id)
      .maybeSingle();

    // Fetch vacations
    const { data: vacations } = await supabase
      .from("vacations")
      .select("start_date, end_date")
      .eq("user_id", u.user_id);

    // Fetch sick leaves
    const { data: sickLeaves } = await supabase
      .from("sick_leaves")
      .select("start_date, end_date")
      .eq("user_id", u.user_id);

    // Determine status
    const today = new Date().toISOString().slice(0, 10);
    const isOnVacation = vacations?.some(v => v.start_date <= today && v.end_date >= today);
    const isOnSick = sickLeaves?.some(s => s.start_date <= today && s.end_date >= today);

    const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey = dayKeys[new Date().getDay()];
    const scheduleVal = schedule?.[todayKey as keyof typeof schedule] || "office";

    let status: MockUser["status"] = scheduleVal === "day_off" ? "day_off" : scheduleVal === "remote" ? "remote" : "office";
    if (isOnVacation) status = "vacation";
    if (isOnSick) status = "sick";

    setCardUser({
      id: profile.id,
      userId: profile.user_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      middleName: profile.middle_name || undefined,
      position: profile.position || "",
      team: profile.team || "",
      status,
      phone: profile.phone || "",
      messenger: profile.messenger || "",
      city: profile.city || "",
      birthday: profile.birthday || "",
      desk: profile.desk || "",
      avatar: profile.avatar_url || undefined,
      schedule: schedule ? { mon: schedule.mon, tue: schedule.tue, wed: schedule.wed, thu: schedule.thu, fri: schedule.fri, sat: schedule.sat, sun: schedule.sun } : {},
      vacations: vacations?.map(v => ({ start: v.start_date, end: v.end_date })) || [],
      sickLeaves: sickLeaves?.map(s => ({ start: s.start_date, end: s.end_date })) || [],
    });
  }, []);

  const closeCard = useCallback(() => setCardUser(null), []);

  return { cardUser, openCard, closeCard };
};
