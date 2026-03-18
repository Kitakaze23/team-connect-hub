import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Plus, Send, Trash2, X } from "lucide-react";
import {
  BacklogTask,
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
import { format } from "date-fns";

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

export default function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const { membership } = useAuth();
  const isAdmin = membership?.role === "admin";
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: comments = [] } = useTaskComments(task?.id ?? null);
  const addComment = useAddComment();
  const stageIds = task?.stages.map((s) => s.id) || [];
  const { data: allLinks = [] } = useStageLinks(stageIds);
  const addLink = useAddStageLink();
  const removeLink = useDeleteStageLink();

  const [commentText, setCommentText] = useState("");
  const [newLinkStageId, setNewLinkStageId] = useState<string | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");

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

  const taskTypeLabel = task.task_type === "web" ? "WEB" : task.task_type === "mobile" ? "Mobile" : "Техническая";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {task.title}
            <Badge variant="outline" className="ml-2">{taskTypeLabel}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Status */}
        <div className="flex items-center gap-3">
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
        </div>

        <Separator />

        {/* Stages */}
        <div>
          <Label className="font-semibold text-base">Этапы</Label>
          <div className="space-y-2 mt-2">
            {task.stages.map((stage) => {
              const links = allLinks.filter((l) => l.stage_id === stage.id);
              return (
                <div key={stage.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage.stage_name] }} />
                    <span className="font-medium text-sm">{STAGE_LABELS[stage.stage_name]}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(stage.start_date), "dd.MM.yyyy")} — {format(new Date(stage.end_date), "dd.MM.yyyy")}
                    </span>
                  </div>
                  {/* Links */}
                  {links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {links.map((link) => (
                        <div key={link.id} className="flex items-center gap-1 bg-secondary rounded px-2 py-0.5">
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            {link.label || link.url}
                          </a>
                          {isAdmin && (
                            <button onClick={() => removeLink.mutate(link.id)} className="text-muted-foreground hover:text-destructive">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isAdmin && (
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
                {task.dependencies.map((dep) => (
                  <div key={dep.id} className="border border-border rounded-lg p-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-sm">{dep.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {dep.status === "done" ? "Готово" : dep.status === "in_progress" ? "В работе" : "Ожидание"}
                      </Badge>
                    </div>
                    {dep.description && <p className="text-xs text-muted-foreground mt-1">{dep.description}</p>}
                    {dep.release_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Релиз: {format(new Date(dep.release_date), "dd.MM.yyyy")}
                      </p>
                    )}
                  </div>
                ))}
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
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Удалить задачу
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
