import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { STAGE_NAMES, STAGE_LABELS, useCreateTask } from "@/hooks/useBacklog";
import { format, addDays } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const today = () => format(new Date(), "yyyy-MM-dd");
const nextWeek = () => format(addDays(new Date(), 7), "yyyy-MM-dd");

export default function CreateTaskDialog({ open, onOpenChange }: Props) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("web");
  const [hasDeps, setHasDeps] = useState(false);
  const [stages, setStages] = useState(
    STAGE_NAMES.map((name) => ({ stage_name: name, start_date: today(), end_date: nextWeek(), enabled: true }))
  );
  const [deps, setDeps] = useState<{ name: string; description: string; release_date: string; status: string }[]>([]);

  const updateStage = (idx: number, field: string, value: string) => {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addDep = () => setDeps((p) => [...p, { name: "", description: "", release_date: today(), status: "pending" }]);
  const removeDep = (i: number) => setDeps((p) => p.filter((_, idx) => idx !== i));
  const updateDep = (idx: number, field: string, value: string) => {
    setDeps((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    const enabledStages = stages.filter(s => s.enabled).map(({ enabled, ...rest }) => rest);
    createTask.mutate(
      {
        title: title.trim(),
        task_type: taskType,
        has_dependencies: hasDeps,
        stages: enabledStages,
        dependencies: hasDeps ? deps : [],
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setTitle("");
          setTaskType("web");
          setHasDeps(false);
          setStages(STAGE_NAMES.map((name) => ({ stage_name: name, start_date: today(), end_date: nextWeek(), enabled: true })));
          setDeps([]);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название задачи" />
          </div>

          <div>
            <Label>Тип задачи</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="web">WEB</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="technical">Техническая</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="font-semibold">Этапы</Label>
            <div className="space-y-2 mt-2">
              {stages.map((stage, idx) => (
                <div key={stage.stage_name} className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
                  <Checkbox
                    checked={stage.enabled}
                    onCheckedChange={(checked) =>
                      setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, enabled: !!checked } : s)))
                    }
                  />
                  <span className={`text-sm ${stage.enabled ? "text-muted-foreground" : "text-muted-foreground/40 line-through"}`}>
                    {STAGE_LABELS[stage.stage_name]}
                  </span>
                  <Input
                    type="date"
                    value={stage.start_date}
                    onChange={(e) => updateStage(idx, "start_date", e.target.value)}
                    className="w-36"
                    disabled={!stage.enabled}
                  />
                  <Input
                    type="date"
                    value={stage.end_date}
                    onChange={(e) => updateStage(idx, "end_date", e.target.value)}
                    className="w-36"
                    disabled={!stage.enabled}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={hasDeps} onCheckedChange={setHasDeps} />
            <Label>Есть смежники</Label>
          </div>

          {hasDeps && (
            <div className="space-y-3">
              <Label className="font-semibold">Смежники</Label>
              {deps.map((dep, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Смежник {idx + 1}</span>
                    <Button variant="ghost" size="icon" onClick={() => removeDep(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input placeholder="Название" value={dep.name} onChange={(e) => updateDep(idx, "name", e.target.value)} />
                  <Textarea placeholder="Описание" value={dep.description} onChange={(e) => updateDep(idx, "description", e.target.value)} className="min-h-[60px]" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Дата релиза</Label>
                      <Input type="date" value={dep.release_date} onChange={(e) => updateDep(idx, "release_date", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Статус</Label>
                      <Select value={dep.status} onValueChange={(v) => updateDep(idx, "status", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Ожидание</SelectItem>
                          <SelectItem value="in_progress">В работе</SelectItem>
                          <SelectItem value="done">Готово</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addDep}>
                <Plus className="w-4 h-4 mr-1" /> Добавить смежник
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={createTask.isPending || !title.trim()}>
            {createTask.isPending ? "Создание..." : "Создать"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
