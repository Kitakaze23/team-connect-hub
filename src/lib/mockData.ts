export interface MockUser {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  position: string;
  team: string;
  status: "office" | "remote" | "vacation" | "sick" | "day_off";
  phone: string;
  messenger: string;
  city: string;
  birthday: string;
  desk: string;
  avatar?: string;
  schedule: Record<string, string>;
  vacations: { start: string; end: string }[];
  sickLeaves: { start: string; end: string }[];
}

export const mockTeams = ["Разработка", "Дизайн", "Маркетинг"];

export const mockUsers: MockUser[] = [
  {
    id: "1",
    firstName: "Алексей",
    lastName: "Петров",
    middleName: "Игоревич",
    position: "Frontend разработчик",
    team: "Разработка",
    status: "office",
    phone: "+7 (999) 123-45-67",
    messenger: "@alexey_p",
    city: "Москва",
    birthday: "1990-03-15",
    desk: "A-12",
    schedule: { mon: "remote", tue: "remote", wed: "office", thu: "office", fri: "remote" },
    vacations: [{ start: "2026-03-10", end: "2026-03-24" }],
    sickLeaves: [],
  },
  {
    id: "2",
    firstName: "Мария",
    lastName: "Иванова",
    middleName: "Сергеевна",
    position: "UI/UX Дизайнер",
    team: "Дизайн",
    status: "remote",
    phone: "+7 (999) 234-56-78",
    messenger: "@maria_i",
    city: "Санкт-Петербург",
    birthday: "1993-07-22",
    desk: "B-05",
    schedule: { mon: "office", tue: "remote", wed: "remote", thu: "office", fri: "office" },
    vacations: [],
    sickLeaves: [],
  },
  {
    id: "3",
    firstName: "Дмитрий",
    lastName: "Козлов",
    middleName: "Андреевич",
    position: "Backend разработчик",
    team: "Разработка",
    status: "vacation",
    phone: "+7 (999) 345-67-89",
    messenger: "@dmitry_k",
    city: "Казань",
    birthday: "1988-11-30",
    desk: "A-15",
    schedule: { mon: "office", tue: "office", wed: "office", thu: "office", fri: "remote" },
    vacations: [{ start: "2026-02-25", end: "2026-03-05" }],
    sickLeaves: [],
  },
  {
    id: "4",
    firstName: "Елена",
    lastName: "Смирнова",
    middleName: "Викторовна",
    position: "Маркетолог",
    team: "Маркетинг",
    status: "office",
    phone: "+7 (999) 456-78-90",
    messenger: "@elena_s",
    city: "Москва",
    birthday: "1995-01-10",
    desk: "C-03",
    schedule: { mon: "office", tue: "office", wed: "remote", thu: "office", fri: "office" },
    vacations: [],
    sickLeaves: [],
  },
  {
    id: "5",
    firstName: "Артём",
    lastName: "Новиков",
    position: "DevOps инженер",
    team: "Разработка",
    status: "sick",
    phone: "+7 (999) 567-89-01",
    messenger: "@artem_n",
    city: "Новосибирск",
    birthday: "1991-05-18",
    desk: "A-20",
    schedule: { mon: "remote", tue: "remote", wed: "remote", thu: "remote", fri: "remote" },
    vacations: [],
    sickLeaves: [{ start: "2026-02-26", end: "2026-03-02" }],
  },
  {
    id: "6",
    firstName: "Ольга",
    lastName: "Федорова",
    middleName: "Павловна",
    position: "Графический дизайнер",
    team: "Дизайн",
    status: "office",
    phone: "+7 (999) 678-90-12",
    messenger: "@olga_f",
    city: "Екатеринбург",
    birthday: "1994-09-25",
    desk: "B-08",
    schedule: { mon: "office", tue: "office", wed: "office", thu: "remote", fri: "remote" },
    vacations: [{ start: "2026-03-15", end: "2026-03-22" }],
    sickLeaves: [],
  },
  {
    id: "7",
    firstName: "Иван",
    lastName: "Сидоров",
    position: "Контент-менеджер",
    team: "Маркетинг",
    status: "remote",
    phone: "+7 (999) 789-01-23",
    messenger: "@ivan_s",
    city: "Краснодар",
    birthday: "1992-12-05",
    desk: "C-07",
    schedule: { mon: "remote", tue: "office", wed: "office", thu: "remote", fri: "remote" },
    vacations: [],
    sickLeaves: [],
  },
];

export type ChatMessage = {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
  pinned?: boolean;
};

export const mockMessages: ChatMessage[] = [
  { id: "m1", userId: "1", text: "Всем привет! Кто сегодня в офисе?", timestamp: "2026-02-27T09:00:00" },
  { id: "m2", userId: "4", text: "Я на месте 🙋‍♀️", timestamp: "2026-02-27T09:01:00" },
  { id: "m3", userId: "2", text: "Работаю удаленно сегодня, но на связи!", timestamp: "2026-02-27T09:03:00" },
  { id: "m4", userId: "6", text: "В офисе, кофе уже готов ☕", timestamp: "2026-02-27T09:05:00" },
  { id: "m5", userId: "7", text: "Подключился из Краснодара. Какие задачи на сегодня?", timestamp: "2026-02-27T09:10:00" },
  { id: "m6", userId: "1", text: "Дмитрий в отпуске до 5 марта, его задачи перераспределены", timestamp: "2026-02-27T09:15:00", pinned: true },
  { id: "m7", userId: "4", text: "Отлично, спасибо за инфо!", timestamp: "2026-02-27T09:16:00" },
];

export const statusLabels: Record<string, string> = {
  office: "Офис",
  remote: "Удалённо",
  vacation: "Отпуск",
  sick: "Больничный",
  day_off: "Выходной",
};

export const statusColors: Record<string, string> = {
  office: "bg-status-office",
  remote: "bg-status-remote",
  vacation: "bg-status-vacation",
  sick: "bg-status-sick",
  day_off: "bg-status-remote",
};
