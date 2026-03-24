import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface MediaPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  type: "image" | "video";
}

const MediaPreviewDialog = ({ open, onOpenChange, url, type }: MediaPreviewDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none overflow-hidden [&>button]:hidden">
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          {type === "video" ? (
            <video src={url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
          ) : (
            <img src={url} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MediaPreviewDialog;
