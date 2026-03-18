import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, Pencil, Plus, Send, Trash2, X, Check, Archive } from "lucide-react";
import {
  BacklogTask,
  STAGE_NAMES,
  STAGE_LABELS,
  STAGE_COLORS,
  useUpdateTask,
  useDeleteTask,
  useTaskComments,
  useAddComment,
  useStageLinks,
  useAddStageLink,
  useDeleteStageLink,
} from "@/hooks/useBacklog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";

interface Props {
  task: BacklogTask | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Бэклог",
  development: "Разработка",
  prom: "ПРОМ",
  cancelled: "Отменена",
};

const today = () => format(new Date(), "yyyy-MM-dd");
const nextWeek = () => format(addDays(new Date(), 7), "yyyy-MM-dd");

interface TeamMember {
  user_id: string;
  first_name: string;
  last_name: string;
}

export default function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const { membership } = useAuth();
  const isAdmin = membership?.role === "admin";
  const companyId = membership?.company_id;
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: comments = [] } = useTaskComments(task?.id ?? null);
  const addComment = useAddComment();
  const stageIds = task?.stages.map((s) => s.id) || [];
  const { data: allLinks = [] } = useStageLinks(stageIds);
  const addLink = useAddStageLink();
  const removeLink = useDeleteStageLink();

  // Fetch team members for responsible assignment
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-backlog", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: members } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId!)
        .eq("status", "approved");
      if (!members?.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name")
        .in("user_id", members.map(m => m.user_id));
      return (profiles || []) as TeamMember[];
    },
  });

  const [commentText, setCommentText] = useState("");
  const [newLinkStageId, setNewLinkStageId] = useState<string | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [editingStageName, setEditingStageName] = useState<string | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editingDepId, setEditingDepId] = useState<string | null>(null);
  const [editDepReleaseDate, setEditDepReleaseDate] = useState("");
  const [editDepDescription, setEditDepDescription] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  if (!task) return null;

  const handleStatusChange = (status: string) => {
    updateTask.mutate({ id: task.id, status });
  };

  const handleDelete = () => {
    deleteTask.mutate(task.id, { onSuccess: () => onOpenChange(false) });
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate({ task_id: task.id, text: commentText.trim() });
    setCommentText("");
  };

  const handleAddLink = () => {
    if (!newLinkStageId || !newLinkUrl.trim()) return;
    addLink.mutate({ stage_id: newLinkStageId, url: newLinkUrl.trim(), label: newLinkLabel.trim() });
    setNewLinkUrl("");
    setNewLinkLabel("");
    setNewLinkStageId(null);
  };

  const handleSaveDep = (depId: string) => {
    const newDeps = task.dependencies.map(d =>
      d.id === depId
        ? { name: d.name, description: editDepDescription, release_date: editDepReleaseDate || null, status: d.status }
        : { name: d.name, description: d.description, release_date: d.release_date, status: d.status }
    );
    updateTask.mutate({ id: task.id, dependencies: newDeps });
    setEditingDepId(null);
  };

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue.trim() !== task.title) {
      updateTask.mutate({ id: task.id, title: titleValue.trim() });
    }
    setEditingTitle(false);
  };

  const handleToggleStage = (stageName: string, enabled: boolean) => {
    if (enabled) {
      const newStages = [
        ...task.stages.map(s => ({ stage_name: s.stage_name, start_date: s.start_date, end_date: s.end_date, responsible_user_id: s.responsible_user_id })),
        { stage_name: stageName, start_date: today(), end_date: nextWeek(), responsible_user_id: null },
      ];
      newStages.sort((a, b) => STAGE_NAMES.indexOf(a.stage_name) - STAGE_NAMES.indexOf(b.stage_name));
      updateTask.mutate({ id: task.id, stages: newStages });
    } else {
      const newStages = task.stages
        .filter(s => s.stage_name !== stageName)
        .map(s => ({ stage_name: s.stage_name, start_date: s.start_date, end_date: s.end_date, responsible_user_id: s.responsible_user_id }));
      updateTask.mutate({ id: task.id, stages: newStages });
    }
  };

  const handleChangeResponsible = (stageId: string, userId: string | null) => {
    const newStages = task.stages.map(s => ({
      stage_name: s.stage_name,
      start_date: s.start_date,
      end_date: s.end_date,
      responsible_user_id: s.id === stageId ? userId : s.responsible_user_id,
    }));
    updateTask.mutate({ id: task.id, stages: newStages });
  };

  const handleArchiveToggle = (archived: boolean) => {
    updateTask.mutate({ id: task.id, status: archived ? "archived" : "development" });
  };

  const isArchived = task.status === "archived";
  const taskTypeLabel = task.task_type === "web" ? "WEB" : task.task_type === "mobile" ? "Mobile" : "Техническая";

  const getMemberName = (userId: string | null) => {
    if (!userId) return null;
    const m = teamMembers.find(t => t.user_id === userId);
    return m ? `${m.first_name} ${m.last_name}` : null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAdmin && editingTitle ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  className="h-8 text-lg font-semibold"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                  autoFocus
                />
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleSaveTitle}><Check className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingTitle(false)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <>
                {task.title}
                {isAdmin && (
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => { setEditingTitle(true); setTitleValue(task.title); }}>
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            <Badge variant="outline" className="ml-2">{taskTypeLabel}</Badge>
            {isArchived && <Badge variant="secondary" className="ml-1"><Archive className="w-3 h-3 mr-1" />Архив</Badge>}
          </DialogTitle>
        </DialogHeader>

        {/* Status + Archive */}
        <div className="flex items-center gap-3 flex-wrap">
          <Label>Статус:</Label>
          {isAdmin ? (
            <Select value={task.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge>{STATUS_LABELS[task.status] || task.status}</Badge>
          )}
          {isAdmin && (
            <label className="flex items-center gap-2 ml-auto cursor-pointer text-sm text-muted-foreground">
              <Checkbox
                checked={isArchived}
                onCheckedChange={(checked) => handleArchiveToggle(!!checked)}
              />
              <Archive className="w-4 h-4" />
              В архив
            </label>
          )}
        </div>

        <Separator />

        {/* Stages */}
        <div>
          <Label className="font-semibold text-base">Этапы</Label>
          <div className="space-y-2 mt-2">
            {STAGE_NAMES.map((stageName) => {
              const stage = task.stages.find(s => s.stage_name === stageName);
              const isActive = !!stage;
              const links = stage ? allLinks.filter((l) => l.stage_id === stage.id) : [];
              const isEditingDates = isActive && editingStageName === stageName;
              const responsibleName = stage ? getMemberName(stage.responsible_user_id) : null;

              return (
                <div key={stageName} className={`border border-border rounded-lg p-3 ${!isActive ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <Checkbox
                        checked={isActive}
                        onCheckedChange={(checked) => handleToggleStage(stageName, !!checked)}
                      />
                    )}
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STAGE_COLORS[stageName] }} />
                    <span className={`font-medium text-sm ${!isActive ? "line-through text-muted-foreground" : ""}`}>
                      {STAGE_LABELS[stageName]}
                    </span>
                    {stage && (
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                        {isEditingDates ? (
                          <div className="flex gap-1 items-center">
                            <Input type="date" className="h-7 text-xs w-32" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
                            <span>—</span>
                            <Input type="date" className="h-7 text-xs w-32" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} />
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                              if (editStartDate && editEndDate) {
                                const newStages = task.stages.map(s =>
                                  s.stage_name === stage.stage_name
                                    ? { stage_name: s.stage_name, start_date: editStartDate, end_date: editEndDate, responsible_user_id: s.responsible_user_id }
                                    : { stage_name: s.stage_name, start_date: s.start_date, end_date: s.end_date, responsible_user_id: s.responsible_user_id }
                                );
                                updateTask.mutate({ id: task.id, stages: newStages });
                              }
                              setEditingStageName(null);
                            }}>✓</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingStageName(null)}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <>
                            {format(new Date(stage.start_date), "dd.MM.yyyy")} — {format(new Date(stage.end_date), "dd.MM.yyyy")}
                            {isAdmin && (
                              <button className="text-muted-foreground hover:text-foreground" onClick={() => {
                                setEditingStageId(stage.id);
                                setEditStartDate(stage.start_date);
                                setEditEndDate(stage.end_date);
                              }}>
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Responsible person */}
                  {stage && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Ответственный:</span>
                      {isAdmin ? (
                        <Select
                          value={stage.responsible_user_id || "__none__"}
                          onValueChange={(v) => handleChangeResponsible(stage.id, v === "__none__" ? null : v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="Не назначен" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Не назначен</SelectItem>
                            {teamMembers.map(m => (
                              <SelectItem key={m.user_id} value={m.user_id}>
                                {m.first_name} {m.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-foreground">{responsibleName || "Не назначен"}</span>
                      )}
                    </div>
                  )}

                  {/* Links */}
                  {stage && links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {links.map((link) => (
                        <div key={link.id} className="flex items-center gap-1 bg-secondary rounded px-2 py-0.5">
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            {link.label || link.url}
                          </a>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="text-muted-foreground hover:text-destructive">
                                  <X className="w-3 h-3" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить ссылку?</AlertDialogTitle>
                                  <AlertDialogDescription>Ссылка «{link.label || link.url}» будет удалена.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeLink.mutate(link.id)}>Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isAdmin && stage && (
                    <div className="mt-1">
                      {newLinkStageId === stage.id ? (
                        <div className="flex gap-1 items-center">
                          <Input className="h-7 text-xs" placeholder="URL" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} />
                          <Input className="h-7 text-xs w-24" placeholder="Метка" value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} />
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleAddLink}><Plus className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setNewLinkStageId(null)}><X className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setNewLinkStageId(stage.id)}>
                          + Добавить ссылку
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dependencies */}
        {task.has_dependencies && task.dependencies.length > 0 && (
          <>
            <Separator />
            <div>
              <Label className="font-semibold text-base">Смежники</Label>
              <div className="space-y-2 mt-2">
                {task.dependencies.map((dep) => {
                  const isEditingDep = editingDepId === dep.id;
                  return (
                    <div key={dep.id} className="border border-border rounded-lg p-3">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">{dep.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {dep.status === "done" ? "Готово" : dep.status === "in_progress" ? "В работе" : "Ожидание"}
                        </Badge>
                      </div>
                      {isEditingDep ? (
                        <div className="mt-2 space-y-2">
                          <div>
                            <Label className="text-xs">Описание</Label>
                            <Textarea className="text-xs h-16" value={editDepDescription} onChange={(e) => setEditDepDescription(e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">Дата релиза</Label>
                            <Input type="date" className="h-7 text-xs w-40" value={editDepReleaseDate} onChange={(e) => setEditDepReleaseDate(e.target.value)} />
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSaveDep(dep.id)}>✓ Сохранить</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingDepId(null)}><X className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {dep.description && <p className="text-xs text-muted-foreground mt-1">{dep.description}</p>}
                          {dep.release_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Релиз: {format(new Date(dep.release_date), "dd.MM.yyyy")}
                            </p>
                          )}
                          {isAdmin && (
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1"
                              onClick={() => {
                                setEditingDepId(dep.id);
                                setEditDepDescription(dep.description || "");
                                setEditDepReleaseDate(dep.release_date || "");
                              }}
                            >
                              <Pencil className="w-3 h-3" /> Редактировать
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Comments */}
        <div>
          <Label className="font-semibold text-base">Комментарии</Label>
          <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
            {comments.length === 0 && <p className="text-xs text-muted-foreground">Нет комментариев</p>}
            {comments.map((c) => (
              <div key={c.id} className="bg-secondary rounded-lg p-2">
                <p className="text-sm">{c.text}</p>
                <p className="text-xs text-muted-foreground mt-1">{format(new Date(c.created_at), "dd.MM.yyyy HH:mm")}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Написать комментарий..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
            />
            <Button size="icon" onClick={handleAddComment} disabled={!commentText.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-1" /> Удалить задачу
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить задачу?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Задача «{task.title}» и все связанные данные (этапы, ссылки, комментарии) будут удалены безвозвратно.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Удалить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}