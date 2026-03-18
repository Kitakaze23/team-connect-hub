import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface BacklogTask {
  id: string;
  company_id: string;
  title: string;
  task_type: string;
  status: string;
  has_dependencies: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  stages: BacklogStage[];
  dependencies: BacklogDependency[];
}

export interface BacklogStage {
  id: string;
  task_id: string;
  stage_name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
}

export interface BacklogDependency {
  id: string;
  task_id: string;
  name: string;
  description: string;
  release_date: string | null;
  status: string;
}

export interface BacklogMilestone {
  id: string;
  company_id: string;
  name: string;
  date: string;
  milestone_type: string;
}

export interface BacklogComment {
  id: string;
  task_id: string;
  user_id: string;
  text: string;
  created_at: string;
}

export interface StageLink {
  id: string;
  stage_id: string;
  url: string;
  label: string;
}

const STAGE_NAMES = [
  "business_requirements",
  "design",
  "analytics",
  "development",
  "testing",
  "release",
];

const STAGE_LABELS: Record<string, string> = {
  business_requirements: "Бизнес-требования",
  analytics: "Аналитика",
  design: "Дизайн",
  development: "Разработка",
  testing: "Тестирование",
  release: "Релиз",
};

const STAGE_COLORS: Record<string, string> = {
  business_requirements: "hsl(260, 50%, 55%)",
  analytics: "hsl(210, 70%, 55%)",
  design: "hsl(174, 60%, 42%)",
  development: "hsl(30, 90%, 55%)",
  testing: "hsl(0, 72%, 55%)",
  release: "hsl(160, 70%, 40%)",
};

export { STAGE_NAMES, STAGE_LABELS, STAGE_COLORS };

export function useBacklogTasks() {
  const { membership } = useAuth();
  const companyId = membership?.company_id;

  return useQuery({
    queryKey: ["backlog-tasks", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from("backlog_tasks")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at");

      if (error) throw error;

      const taskIds = tasks.map((t: any) => t.id);
      
      const [stagesRes, depsRes] = await Promise.all([
        supabase.from("backlog_task_stages").select("*").in("task_id", taskIds).order("sort_order"),
        supabase.from("backlog_task_dependencies").select("*").in("task_id", taskIds),
      ]);

      const stagesByTask: Record<string, BacklogStage[]> = {};
      (stagesRes.data || []).forEach((s: any) => {
        if (!stagesByTask[s.task_id]) stagesByTask[s.task_id] = [];
        stagesByTask[s.task_id].push(s);
      });

      const depsByTask: Record<string, BacklogDependency[]> = {};
      (depsRes.data || []).forEach((d: any) => {
        if (!depsByTask[d.task_id]) depsByTask[d.task_id] = [];
        depsByTask[d.task_id].push(d);
      });

      return tasks.map((t: any) => ({
        ...t,
        stages: stagesByTask[t.id] || [],
        dependencies: depsByTask[t.id] || [],
      })) as BacklogTask[];
    },
  });
}

export function useBacklogMilestones() {
  const { membership } = useAuth();
  const companyId = membership?.company_id;

  return useQuery({
    queryKey: ["backlog-milestones", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backlog_milestones")
        .select("*")
        .eq("company_id", companyId!)
        .order("date");
      if (error) throw error;
      return data as BacklogMilestone[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { membership } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      task_type: string;
      has_dependencies: boolean;
      stages: { stage_name: string; start_date: string; end_date: string }[];
      dependencies: { name: string; description: string; release_date: string | null; status: string }[];
    }) => {
      const { data: task, error } = await supabase
        .from("backlog_tasks")
        .insert({
          company_id: membership!.company_id,
          title: payload.title,
          task_type: payload.task_type,
          has_dependencies: payload.has_dependencies,
          created_by: (await supabase.auth.getUser()).data.user!.id,
        })
        .select()
        .single();

      if (error) throw error;

      if (payload.stages.length) {
        const { error: stErr } = await supabase.from("backlog_task_stages").insert(
          payload.stages.map((s, i) => ({
            task_id: task.id,
            stage_name: s.stage_name,
            start_date: s.start_date,
            end_date: s.end_date,
            sort_order: i,
          }))
        );
        if (stErr) throw stErr;
      }

      if (payload.dependencies.length) {
        const { error: depErr } = await supabase.from("backlog_task_dependencies").insert(
          payload.dependencies.map((d) => ({
            task_id: task.id,
            name: d.name,
            description: d.description,
            release_date: d.release_date,
            status: d.status,
          }))
        );
        if (depErr) throw depErr;
      }

      return task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-tasks"] });
      toast({ title: "Задача создана" });
    },
    onError: (e) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      title?: string;
      task_type?: string;
      status?: string;
      has_dependencies?: boolean;
      stages?: { stage_name: string; start_date: string; end_date: string }[];
      dependencies?: { name: string; description: string; release_date: string | null; status: string }[];
    }) => {
      const { id, stages, dependencies, ...fields } = payload;

      if (Object.keys(fields).length) {
        const { error } = await supabase.from("backlog_tasks").update(fields).eq("id", id);
        if (error) throw error;
      }

      if (stages) {
        await supabase.from("backlog_task_stages").delete().eq("task_id", id);
        if (stages.length) {
          const { error } = await supabase.from("backlog_task_stages").insert(
            stages.map((s, i) => ({ task_id: id, stage_name: s.stage_name, start_date: s.start_date, end_date: s.end_date, sort_order: i }))
          );
          if (error) throw error;
        }
      }

      if (dependencies) {
        await supabase.from("backlog_task_dependencies").delete().eq("task_id", id);
        if (dependencies.length) {
          const { error } = await supabase.from("backlog_task_dependencies").insert(
            dependencies.map((d) => ({ task_id: id, name: d.name, description: d.description, release_date: d.release_date, status: d.status }))
          );
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-tasks"] });
      toast({ title: "Задача обновлена" });
    },
    onError: (e) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("backlog_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-tasks"] });
      toast({ title: "Задача удалена" });
    },
  });
}

export function useCreateMilestone() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  return useMutation({
    mutationFn: async (payload: { name: string; date: string; milestone_type: string }) => {
      const { error } = await supabase.from("backlog_milestones").insert({
        company_id: membership!.company_id,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-milestones"] });
      toast({ title: "Отсечка добавлена" });
    },
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; date?: string; milestone_type?: string; name?: string }) => {
      const { id, ...fields } = payload;
      const { error } = await supabase.from("backlog_milestones").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-milestones"] });
      toast({ title: "Отсечка обновлена" });
    },
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("backlog_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-milestones"] });
      toast({ title: "Отсечка удалена" });
    },
  });
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ["backlog-comments", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backlog_task_comments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at");
      if (error) throw error;
      return data as BacklogComment[];
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { task_id: string; text: string }) => {
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const { error } = await supabase.from("backlog_task_comments").insert({
        task_id: payload.task_id,
        user_id: userId,
        text: payload.text,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["backlog-comments", vars.task_id] });
    },
  });
}

export function useStageLinks(stageIds: string[]) {
  return useQuery({
    queryKey: ["backlog-stage-links", stageIds],
    enabled: stageIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backlog_stage_links")
        .select("*")
        .in("stage_id", stageIds);
      if (error) throw error;
      return data as StageLink[];
    },
  });
}

export function useAddStageLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { stage_id: string; url: string; label: string }) => {
      const { error } = await supabase.from("backlog_stage_links").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-stage-links"] });
    },
  });
}

export function useDeleteStageLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("backlog_stage_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlog-stage-links"] });
    },
  });
}
