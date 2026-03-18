import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateMilestone } from "@/hooks/useBacklog";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const MILESTONE_TYPES: Record<string, string> = {
  alpha: "Альфа",
  demo: "Демо",
  code_freeze: "Код-Фриз",
  feature_freeze: "Фича-Фриз",
  release_web: "Релиз WEB",
  release_mobile: "Релиз Mobile",
};

export const MILESTONE_COLORS: Record<string, string> = {
  alpha: "hsl(260, 50%, 55%)",
  demo: "hsl(210, 70%, 55%)",
  code_freeze: "hsl(0, 72%, 55%)",
  feature_freeze: "hsl(30, 90%, 55%)",
  release_web: "hsl(160, 70%, 40%)",
  release_mobile: "hsl(174, 60%, 42%)",
};

export { MILESTONE_TYPES };

export default function CreateMilestoneDialog({ open, onOpenChange }: Props) {
  const create = useCreateMilestone();
  const [name, setName] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState("release_web");

  const handleSubmit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), date, milestone_type: type }, {
      onSuccess: () => {
        onOpenChange(false);
        setName("");
        setDate(format(new Date(), "yyyy-MM-dd"));
        setType("release_web");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Новая отсечка</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название отсечки" />
          </div>
          <div>
            <Label>Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || !name.trim()}>Создать</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
