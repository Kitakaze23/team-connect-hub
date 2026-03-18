import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Flag, Loader2, Archive } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useBacklogTasks,
  useBacklogMilestones,
  BacklogTask,
  STAGE_LABELS,
  STAGE_COLORS,
} from "@/hooks/useBacklog";
import { MILESTONE_COLORS, MILESTONE_TYPES } from "@/components/backlog/CreateMilestoneDialog";
import CreateTaskDialog from "@/components/backlog/CreateTaskDialog";
import CreateMilestoneDialog from "@/components/backlog/CreateMilestoneDialog";
import TaskDetailDialog from "@/components/backlog/TaskDetailDialog";
import { addDays, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, eachDayOfInterval, eachWeekOfInterval, format, isSameMonth, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

type Period = "week" | "month" | "quarter" | "custom";

const STATUS_LABELS: Record<string, string> = {
  development: "Разработка",
  prom: "ПРОМ",
  cancelled: "Отменена",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  web: "WEB",
  mobile: "Mobile",
  technical: "Тех",
};

export default function BacklogView() {
  const { membership } = useAuth();
  const isAdmin = membership?.role === "admin";
  const { data: tasks = [], isLoading: tasksLoading } = useBacklogTasks();
  const { data: milestones = [], isLoading: milestonesLoading } = useBacklogMilestones();

  const [period, setPeriod] = useState<Period>("month");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createMilestoneOpen, setCreateMilestoneOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<BacklogTask | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Calculate timeline range
  const { timelineStart, timelineEnd, days, dayWidth } = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date;
    switch (period) {
      case "week":
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case "quarter":
        start = startOfQuarter(now);
        end = endOfQuarter(now);
        break;
      default: // month
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    // Extend range to cover all tasks
    tasks.forEach((t) => {
      t.stages.forEach((s) => {
        const sd = parseISO(s.start_date);
        const ed = parseISO(s.end_date);
        if (sd < start) start = sd;
        if (ed > end) end = ed;
      });
    });

    milestones.forEach((m) => {
      const md = parseISO(m.date);
      if (md < start) start = md;
      if (md > end) end = md;
    });

    // Add padding
    start = addDays(start, -1);
    end = addDays(end, 2);

    const daysArr = eachDayOfInterval({ start, end });
    const totalDays = daysArr.length;
    const dw = period === "quarter" ? 24 : period === "week" ? 80 : 36;

    return { timelineStart: start, timelineEnd: end, days: daysArr, dayWidth: dw };
  }, [period, tasks, milestones]);

  const totalWidth = days.length * dayWidth;

  const getX = (dateStr: string) => {
    const d = parseISO(dateStr);
    const diff = differenceInDays(d, days[0]);
    return diff * dayWidth;
  };

  const getWidth = (startDate: string, endDate: string) => {
    const diff = differenceInDays(parseISO(endDate), parseISO(startDate));
    return Math.max(diff * dayWidth, dayWidth);
  };

  // Group header dates
  const monthHeaders = useMemo(() => {
    const headers: { label: string; startIdx: number; count: number }[] = [];
    let current = "";
    days.forEach((d, i) => {
      const key = format(d, "yyyy-MM");
      if (key !== current) {
        current = key;
        headers.push({ label: format(d, "LLLL yyyy", { locale: ru }), startIdx: i, count: 1 });
      } else {
        headers[headers.length - 1].count++;
      }
    });
    return headers;
  }, [days]);

  if (tasksLoading || milestonesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ROW_HEIGHT = 48;
  const HEADER_HEIGHT = 72;
  const TASK_NAME_WIDTH = 240;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <h2 className="font-mono font-bold text-foreground text-lg">Бэклог</h2>
        <div className="flex-1" />
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Неделя</SelectItem>
            <SelectItem value="month">Месяц</SelectItem>
            <SelectItem value="quarter">Квартал</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <>
            <Button size="sm" variant="outline" onClick={() => setCreateMilestoneOpen(true)}>
              <Flag className="w-4 h-4 mr-1" /> Отсечка
            </Button>
            <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Задача
            </Button>
          </>
        )}
      </div>

      {/* Timeline area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Fixed task names column */}
        <div className="shrink-0 border-r border-border bg-card" style={{ width: TASK_NAME_WIDTH }}>
          <div className="border-b border-border" style={{ height: HEADER_HEIGHT }}>
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase h-full flex items-end pb-2">
              Задачи
            </div>
          </div>
          <div className="overflow-y-auto" style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center px-3 border-b border-border cursor-pointer hover:bg-secondary/50 transition-colors"
                style={{ height: ROW_HEIGHT }}
                onClick={() => setSelectedTask(task)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate text-foreground">{task.title}</div>
                  <div className="flex gap-1 items-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {TASK_TYPE_LABELS[task.task_type] || task.task_type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {STATUS_LABELS[task.status] || task.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                Нет задач
              </div>
            )}
          </div>
        </div>

        {/* Scrollable timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minHeight: "100%" }}>
            {/* Date headers */}
            <div className="sticky top-0 z-10 bg-card border-b border-border" style={{ height: HEADER_HEIGHT }}>
              {/* Month row */}
              <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
                {monthHeaders.map((mh, i) => (
                  <div
                    key={i}
                    className="border-r border-border flex items-center px-2 text-xs font-semibold text-muted-foreground capitalize"
                    style={{ width: mh.count * dayWidth }}
                  >
                    {mh.label}
                  </div>
                ))}
              </div>
              {/* Day row */}
              <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
                {days.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`border-r border-border flex items-center justify-center text-[10px] ${
                        isWeekend ? "text-destructive/60 bg-destructive/5" : "text-muted-foreground"
                      }`}
                      style={{ width: dayWidth }}
                    >
                      {dayWidth >= 30 ? format(d, "d") : (i % 2 === 0 ? format(d, "d") : "")}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Task rows with bars */}
            <div className="relative">
              {/* Grid lines */}
              {days.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={`absolute top-0 bottom-0 border-r ${
                      isWeekend ? "border-border bg-destructive/5" : "border-border/50"
                    }`}
                    style={{ left: i * dayWidth, width: dayWidth, height: tasks.length * ROW_HEIGHT || 200 }}
                  />
                );
              })}

              {/* Milestones */}
              {milestones.map((m) => {
                const x = getX(m.date);
                if (x < 0 || x > totalWidth) return null;
                const color = MILESTONE_COLORS[m.milestone_type] || "hsl(var(--accent))";
                return (
                  <div
                    key={m.id}
                    className="absolute top-0 z-20 pointer-events-none"
                    style={{ left: x + dayWidth / 2, height: tasks.length * ROW_HEIGHT || 200 }}
                  >
                    <div className="w-px h-full" style={{ backgroundColor: color, opacity: 0.6 }} />
                    <div
                      className="absolute -top-0 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                      style={{ backgroundColor: color, color: "white" }}
                    >
                      {m.name}
                    </div>
                  </div>
                );
              })}

              {/* Task bars */}
              {tasks.map((task, rowIdx) => (
                <div
                  key={task.id}
                  className="relative border-b border-border"
                  style={{ height: ROW_HEIGHT }}
                >
                  {task.stages.map((stage) => {
                    const x = getX(stage.start_date);
                    const w = getWidth(stage.start_date, stage.end_date);
                    const color = STAGE_COLORS[stage.stage_name] || "hsl(var(--accent))";
                    return (
                      <div
                        key={stage.id}
                        className="absolute top-2 rounded cursor-pointer hover:opacity-80 transition-opacity group"
                        style={{
                          left: x,
                          width: w,
                          height: ROW_HEIGHT - 16,
                          backgroundColor: color,
                          opacity: 0.85,
                        }}
                        onClick={() => setSelectedTask(task)}
                        title={`${STAGE_LABELS[stage.stage_name]}: ${stage.start_date} — ${stage.end_date}`}
                      >
                        {w > 60 && (
                          <span className="text-[9px] text-white font-medium px-1.5 truncate block leading-[32px]">
                            {STAGE_LABELS[stage.stage_name]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-2 flex flex-wrap gap-3">
        {Object.entries(STAGE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: STAGE_COLORS[key] }} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Dialogs */}
      <CreateTaskDialog open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
      <CreateMilestoneDialog open={createMilestoneOpen} onOpenChange={setCreateMilestoneOpen} />
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(v) => !v && setSelectedTask(null)} />
    </div>
  );
}
