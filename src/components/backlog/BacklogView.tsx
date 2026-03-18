import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Flag, Loader2, Archive, BarChart3, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useBacklogTasks,
  useBacklogMilestones,
  useReorderTasks,
  BacklogTask,
  BacklogMilestone,
  STAGE_LABELS,
  STAGE_COLORS,
} from "@/hooks/useBacklog";
import { MILESTONE_COLORS, MILESTONE_TYPES } from "@/components/backlog/CreateMilestoneDialog";
import CreateTaskDialog from "@/components/backlog/CreateTaskDialog";
import CreateMilestoneDialog from "@/components/backlog/CreateMilestoneDialog";
import EditMilestoneDialog from "@/components/backlog/EditMilestoneDialog";
import TaskDetailDialog from "@/components/backlog/TaskDetailDialog";
import { addDays, differenceInDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, format, parseISO, isWithinInterval } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

function BacklogStats({ tasks }: { tasks: BacklogTask[] }) {
  const now = new Date();
  const yearInterval = { start: startOfYear(now), end: endOfYear(now) };
  const quarterInterval = { start: startOfQuarter(now), end: endOfQuarter(now) };

  const inInterval = (t: BacklogTask, interval: { start: Date; end: Date }) =>
    t.stages.some(s => isWithinInterval(parseISO(s.start_date), interval) || isWithinInterval(parseISO(s.end_date), interval));

  const tasksInYear = tasks.filter(t => inInterval(t, yearInterval));
  const tasksInQuarter = tasks.filter(t => inInterval(t, quarterInterval));
  const tasksInWork = tasks.filter(t => t.status === "development");
  const tasksDone = tasks.filter(t => t.status === "prom");
  const tasksBacklog = tasks.filter(t => t.status === "backlog");

  const byType = (list: BacklogTask[]) => ({
    total: list.length,
    web: list.filter(t => t.task_type === "web").length,
    mobile: list.filter(t => t.task_type === "mobile").length,
    tech: list.filter(t => t.task_type === "technical").length,
  });

  const stats = [
    { label: "В году", ...byType(tasksInYear) },
    { label: "В квартале", ...byType(tasksInQuarter) },
    { label: "В работе", ...byType(tasksInWork) },
    { label: "Завершено", ...byType(tasksDone) },
    { label: "Бэклог", ...byType(tasksBacklog) },
  ];

  // Tasks currently at a specific stage (active = status is development)
  const activeTasks = tasks.filter(t => t.status === "development");
  const nowStr = format(now, "yyyy-MM-dd");
  const atStageNow = (stageName: string) =>
    activeTasks.filter(t => t.stages.some(s => s.stage_name === stageName && s.start_date <= nowStr && s.end_date >= nowStr)).length;

  const roleStats = [
    { label: "Дизайн", value: atStageNow("design") },
    { label: "Аналитика", value: atStageNow("analytics") },
    { label: "Разработка", value: atStageNow("development") },
    { label: "Тестирование", value: atStageNow("testing") },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <BarChart3 className="w-4 h-4 mr-1" /> Статистика
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Статистика задач</p>
          {/* Header */}
          <div className="grid grid-cols-5 gap-1 text-[10px] text-muted-foreground font-medium">
            <span></span>
            <span className="text-center">Все</span>
            <span className="text-center">WEB</span>
            <span className="text-center">Mob</span>
            <span className="text-center">Тех</span>
          </div>
          {stats.map(s => (
            <div key={s.label} className="grid grid-cols-5 gap-1 text-sm">
              <span className="text-muted-foreground text-xs">{s.label}</span>
              <span className="font-medium text-center">{s.total}</span>
              <span className="text-center text-muted-foreground">{s.web}</span>
              <span className="text-center text-muted-foreground">{s.mobile}</span>
              <span className="text-center text-muted-foreground">{s.tech}</span>
            </div>
          ))}

          <div className="border-t border-border pt-2">
            <p className="text-xs font-semibold mb-1">Загрузка по ролям (сейчас)</p>
            {roleStats.map(s => (
              <div key={s.label} className="flex justify-between text-sm">
                <span className="text-muted-foreground text-xs">{s.label}</span>
                <span className="font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Period = "week" | "month" | "quarter" | "year";

type ScaleUnit = "day" | "week" | "month";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Бэклог",
  development: "Разработка",
  prom: "ПРОМ",
  cancelled: "Отменена",
  archived: "Архив",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  web: "WEB",
  mobile: "Mobile",
  technical: "Тех",
};

function getScaleUnit(period: Period): ScaleUnit {
  switch (period) {
    case "week": return "day";
    case "month": return "day";
    case "quarter": return "week";
    case "year": return "month";
  }
}

export default function BacklogView() {
  const { membership } = useAuth();
  const isAdmin = membership?.role === "admin";
  const companyId = membership?.company_id;
  const { data: tasks = [], isLoading: tasksLoading } = useBacklogTasks();
  const { data: milestones = [], isLoading: milestonesLoading } = useBacklogMilestones();
  const reorderTasks = useReorderTasks();
  const [showArchive, setShowArchive] = useState(false);

  const moveTask = useCallback((index: number, direction: "up" | "down") => {
    const vt = showArchive ? tasks.filter(t => t.status === "archived") : tasks.filter(t => t.status !== "archived");
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= vt.length) return;
    const allIds = tasks.map(t => t.id);
    const actualIdx = allIds.indexOf(vt[index].id);
    const actualNewIdx = allIds.indexOf(vt[newIndex].id);
    [allIds[actualIdx], allIds[actualNewIdx]] = [allIds[actualNewIdx], allIds[actualIdx]];
    reorderTasks.mutate(allIds);
  }, [tasks, reorderTasks, showArchive]);

  const { data: sprintSettings } = useQuery({
    queryKey: ["sprint-settings", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("sprint_length_days, sprint_start_date")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      return data as { sprint_length_days: number; sprint_start_date: string | null };
    },
  });

  const currentSprintNumber = useMemo(() => {
    if (!sprintSettings?.sprint_start_date || !sprintSettings?.sprint_length_days) return null;
    const start = parseISO(sprintSettings.sprint_start_date);
    const now = new Date();
    const daysDiff = differenceInDays(now, start);
    if (daysDiff < 0) return null;
    return Math.floor(daysDiff / sprintSettings.sprint_length_days) + 1;
  }, [sprintSettings]);

  const [period, setPeriod] = useState<Period>("month");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createMilestoneOpen, setCreateMilestoneOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);
  const [editingMilestone, setEditingMilestone] = useState<BacklogMilestone | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleTasks = useMemo(() =>
    showArchive ? tasks.filter(t => t.status === "archived") : tasks.filter(t => t.status !== "archived"),
    [tasks, showArchive]
  );

  const scaleUnit = getScaleUnit(period);

  const { timelineStart, timelineEnd, columns, colWidth } = useMemo(() => {
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
      case "year":
        start = startOfYear(now);
        end = endOfYear(now);
        break;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    // Extend range to cover all tasks and milestones
    visibleTasks.forEach((t) => {
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

    start = addDays(start, -1);
    end = addDays(end, 2);

    let cols: Date[];
    let cw: number;

    if (scaleUnit === "day") {
      cols = eachDayOfInterval({ start, end });
      cw = period === "week" ? 80 : 36;
    } else if (scaleUnit === "week") {
      cols = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      cw = 48;
    } else {
      cols = eachMonthOfInterval({ start, end });
      cw = 80;
    }

    return { timelineStart: start, timelineEnd: end, columns: cols, colWidth: cw };
  }, [period, visibleTasks, milestones, scaleUnit]);

  const totalWidth = columns.length * colWidth;

  // Compute position based on scale unit
  const getX = (dateStr: string) => {
    const d = parseISO(dateStr);
    if (scaleUnit === "day") {
      const diff = differenceInDays(d, columns[0]);
      return diff * colWidth;
    } else if (scaleUnit === "week") {
      const diffDays = differenceInDays(d, columns[0]);
      return (diffDays / 7) * colWidth;
    } else {
      // month scale: interpolate
      const diffDays = differenceInDays(d, columns[0]);
      const totalDays = differenceInDays(columns[columns.length - 1], columns[0]) || 1;
      return (diffDays / totalDays) * totalWidth;
    }
  };

  const getWidth = (startDate: string, endDate: string) => {
    const x1 = getX(startDate);
    const x2 = getX(endDate);
    return Math.max(x2 - x1, colWidth / 2);
  };

  // Group headers
  const groupHeaders = useMemo(() => {
    if (scaleUnit === "day") {
      const headers: { label: string; startIdx: number; count: number }[] = [];
      let current = "";
      columns.forEach((d, i) => {
        const key = format(d, "yyyy-MM");
        if (key !== current) {
          current = key;
          headers.push({ label: format(d, "LLLL yyyy", { locale: ru }), startIdx: i, count: 1 });
        } else {
          headers[headers.length - 1].count++;
        }
      });
      return headers;
    } else if (scaleUnit === "week") {
      const headers: { label: string; startIdx: number; count: number }[] = [];
      let current = "";
      columns.forEach((d, i) => {
        const key = format(d, "yyyy-MM");
        if (key !== current) {
          current = key;
          headers.push({ label: format(d, "LLLL yyyy", { locale: ru }), startIdx: i, count: 1 });
        } else {
          headers[headers.length - 1].count++;
        }
      });
      return headers;
    } else {
      // month scale - group by year
      const headers: { label: string; startIdx: number; count: number }[] = [];
      let current = "";
      columns.forEach((d, i) => {
        const key = format(d, "yyyy");
        if (key !== current) {
          current = key;
          headers.push({ label: key, startIdx: i, count: 1 });
        } else {
          headers[headers.length - 1].count++;
        }
      });
      return headers;
    }
  }, [columns, scaleUnit]);

  const getColLabel = (d: Date, i: number) => {
    if (scaleUnit === "day") {
      return colWidth >= 30 ? format(d, "d") : (i % 2 === 0 ? format(d, "d") : "");
    } else if (scaleUnit === "week") {
      return format(d, "d.MM");
    } else {
      return format(d, "LLL", { locale: ru });
    }
  };

  if (tasksLoading || milestonesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ROW_HEIGHT = 48;
  const SEPARATOR_HEIGHT = 3;
  const HEADER_HEIGHT = 72;
  const TASK_NAME_WIDTH = 240;
  const totalGridHeight = visibleTasks.length > 0
    ? visibleTasks.length * ROW_HEIGHT + (visibleTasks.length - 1) * SEPARATOR_HEIGHT
    : 200;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <h2 className="font-mono font-bold text-foreground text-lg">Бэклог</h2>
        {currentSprintNumber && (
          <span className="text-xs font-mono px-2 py-1 rounded bg-secondary text-secondary-foreground">
            Спринт #{currentSprintNumber}
          </span>
        )}
        <div className="flex-1" />
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Неделя</SelectItem>
            <SelectItem value="month">Месяц</SelectItem>
            <SelectItem value="quarter">Квартал</SelectItem>
            <SelectItem value="year">Год</SelectItem>
          </SelectContent>
        </Select>
        <BacklogStats tasks={tasks} />
        <Button
          size="sm"
          variant={showArchive ? "default" : "outline"}
          onClick={() => setShowArchive(!showArchive)}
        >
          <Archive className="w-4 h-4 mr-1" /> Архив
          {tasks.filter(t => t.status === "archived").length > 0 && (
            <span className="ml-1 text-xs">({tasks.filter(t => t.status === "archived").length})</span>
          )}
        </Button>
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
            {visibleTasks.map((task, taskIndex) => (
              <React.Fragment key={task.id}>
                {taskIndex > 0 && (
                  <div className="h-[3px] bg-foreground/15 shrink-0" />
                )}
                <div
                  className={`flex items-center px-2 cursor-pointer hover:bg-secondary/50 transition-colors ${
                    task.status === "prom" ? "bg-muted" : ""
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                {/* Move buttons */}
                {isAdmin && (
                  <div className="flex flex-col shrink-0 mr-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveTask(taskIndex, "up"); }}
                      disabled={taskIndex === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveTask(taskIndex, "down"); }}
                      disabled={taskIndex === visibleTasks.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="min-w-0 flex items-center gap-1.5 flex-1" onClick={() => setSelectedTaskId(task.id)}>
                  {task.status === "backlog" && <Archive className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                  <div>
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
              </div>
              </React.Fragment>
            ))}
            {visibleTasks.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {showArchive ? "Нет архивных задач" : "Нет задач"}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minHeight: "100%" }}>
            {/* Date headers */}
            <div className="sticky top-0 z-10 bg-card border-b border-border" style={{ height: HEADER_HEIGHT }}>
              {/* Group row */}
              <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
                {groupHeaders.map((mh, i) => (
                  <div
                    key={i}
                    className="border-r border-border flex items-center px-2 text-xs font-semibold text-muted-foreground capitalize"
                    style={{ width: mh.count * colWidth }}
                  >
                    {mh.label}
                  </div>
                ))}
              </div>
              {/* Column row */}
              <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
                {columns.map((d, i) => {
                  const isWeekend = scaleUnit === "day" && (d.getDay() === 0 || d.getDay() === 6);
                  return (
                    <div
                      key={i}
                      className={`border-r border-border flex items-center justify-center text-[10px] ${
                        isWeekend ? "text-destructive/60 bg-destructive/5" : "text-muted-foreground"
                      }`}
                      style={{ width: colWidth }}
                    >
                      {getColLabel(d, i)}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Task rows with bars */}
            <div className="relative">
              {/* Grid lines */}
              {columns.map((d, i) => {
                const isWeekend = scaleUnit === "day" && (d.getDay() === 0 || d.getDay() === 6);
                const nextCol = columns[i + 1];
                // Check if this column's right edge is a month or quarter boundary
                const isMonthBoundary = nextCol && d.getMonth() !== nextCol.getMonth();
                const isQuarterBoundary = isMonthBoundary && nextCol && Math.floor(nextCol.getMonth() / 3) !== Math.floor(d.getMonth() / 3);

                let borderClass = "border-border/50";
                let borderStyle: React.CSSProperties = {};
                if (isWeekend) {
                  borderClass = "border-border";
                }
                if (isQuarterBoundary) {
                  borderClass = "border-foreground/30";
                  borderStyle = { borderRightWidth: 3 };
                } else if (isMonthBoundary) {
                  borderClass = "border-foreground/20";
                  borderStyle = { borderRightWidth: 2 };
                }

                return (
                  <div
                    key={i}
                    className={`absolute top-0 bottom-0 border-r ${borderClass} ${
                      isWeekend ? "bg-destructive/5" : ""
                    }`}
                    style={{ left: i * colWidth, width: colWidth, height: totalGridHeight, ...borderStyle }}
                  />
                );
              })}

              {/* Milestones */}
              {milestones.map((m) => {
                const x = getX(m.date);
                if (x < 0 || x > totalWidth) return null;
                const color = MILESTONE_COLORS[m.milestone_type] || "hsl(var(--accent))";
                const defaultLabel = MILESTONE_TYPES[m.milestone_type] || "";
                const label = m.name && m.name !== defaultLabel ? m.name : defaultLabel;
                return (
                  <div
                    key={m.id}
                    className={`absolute top-0 z-20 ${isAdmin ? "cursor-pointer" : "pointer-events-none"}`}
                    style={{ left: x + colWidth / 2, height: totalGridHeight }}
                    onClick={() => isAdmin && setEditingMilestone(m)}
                  >
                    <div className="w-px h-full" style={{ backgroundColor: color, opacity: 0.6 }} />
                    <div
                      className="absolute -top-0 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                      style={{ backgroundColor: color, color: "white" }}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}

              {/* Today line */}
              {(() => {
                const todayX = getX(format(new Date(), "yyyy-MM-dd"));
                if (todayX >= 0 && todayX <= totalWidth) {
                  return (
                    <div
                      className="absolute top-0 z-30 pointer-events-none"
                      style={{ left: todayX + colWidth / 2, height: totalGridHeight }}
                    >
                      <div className="w-0.5 h-full" style={{ backgroundColor: "hsl(345, 80%, 25%)" }} />
                      <div className="absolute -top-0 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap text-white" style={{ backgroundColor: "hsl(345, 80%, 25%)" }}>
                        Сегодня
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Task bars with separators */}
              {visibleTasks.map((task, taskIndex) => {
                // Detect overlapping stages and assign rows
                const stageRows = task.stages.map((stage, idx) => {
                  let row = 0;
                  for (let j = 0; j < idx; j++) {
                    const prev = task.stages[j];
                    if (prev.start_date < stage.end_date && stage.start_date < prev.end_date) {
                      row++;
                    }
                  }
                  return row;
                });
                const maxRow = Math.max(0, ...stageRows);
                const hasOverlap = maxRow > 0;
                const barHeight = hasOverlap ? Math.floor((ROW_HEIGHT - 16) / (maxRow + 1)) - 1 : ROW_HEIGHT - 16;

                return (
                  <React.Fragment key={task.id}>
                    {taskIndex > 0 && (
                      <div className="bg-foreground/15" style={{ height: SEPARATOR_HEIGHT }} />
                    )}
                    <div
                      className="relative"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {task.stages.map((stage, idx) => {
                        const x = getX(stage.start_date);
                        const w = getWidth(stage.start_date, stage.end_date);
                        const color = STAGE_COLORS[stage.stage_name] || "hsl(var(--accent))";
                        const isProm = task.status === "prom";
                        const row = stageRows[idx];
                        const topOffset = 8 + row * (barHeight + 1);
                        return (
                          <div
                            key={stage.id}
                            className="absolute rounded cursor-pointer hover:opacity-80 transition-opacity group"
                            style={{
                              left: x,
                              width: w,
                              top: topOffset,
                              height: barHeight,
                              backgroundColor: color,
                              opacity: isProm ? 0.35 : 0.85,
                            }}
                            onClick={() => setSelectedTaskId(task.id)}
                            title={`${STAGE_LABELS[stage.stage_name]}: ${stage.start_date} — ${stage.end_date}`}
                          >
                            {w > 60 && barHeight >= 16 && (
                              <span
                                className="text-[9px] font-medium px-1.5 truncate block text-white"
                                style={{ lineHeight: `${barHeight}px` }}
                              >
                                {STAGE_LABELS[stage.stage_name]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </React.Fragment>
                );
              })}
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
      <EditMilestoneDialog milestone={editingMilestone} open={!!editingMilestone} onOpenChange={(v) => !v && setEditingMilestone(null)} />
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(v) => !v && setSelectedTaskId(null)} />
    </div>
  );
}
