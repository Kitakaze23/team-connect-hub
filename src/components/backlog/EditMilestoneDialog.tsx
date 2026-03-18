import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateMilestone, useDeleteMilestone, BacklogMilestone } from "@/hooks/useBacklog";
import { MILESTONE_TYPES } from "@/components/backlog/CreateMilestoneDialog";
import { Trash2 } from "lucide-react";

interface Props {
  milestone: BacklogMilestone | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function EditMilestoneDialog({ milestone, open, onOpenChange }: Props) {
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();
  const [date, setDate] = useState("");
  const [type, setType] = useState("");
  const [customName, setCustomName] = useState("");

  useEffect(() => {
    if (milestone) {
      setDate(milestone.date);
      setType(milestone.milestone_type);
      // If name differs from default type label, it's a custom name
      const defaultName = MILESTONE_TYPES[milestone.milestone_type] || "";
      setCustomName(milestone.name !== defaultName ? milestone.name : "");
    }
  }, [milestone]);

  if (!milestone) return null;

  const handleSave = () => {
    const name = customName.trim() || MILESTONE_TYPES[type] || type;
    update.mutate(
      { id: milestone.id, date, milestone_type: type, name },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const handleDelete = () => {
    remove.mutate(milestone.id, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Редактировать отсечку</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Тип</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(MILESTONE_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Название (необязательно)</Label>
            <Input
              placeholder={MILESTONE_TYPES[type] || ""}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>
          <div>
            <Label>Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-between pt-4">
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1" /> Удалить
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={update.isPending}>Сохранить</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
