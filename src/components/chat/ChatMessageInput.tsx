import { useState, useRef } from "react";
import { Send, ImagePlus, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ChatMessageInputProps {
  conversationId: string;
  onMessageSent?: () => void;
}

const ACCEPTED_TYPES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime";

const ChatMessageInput = ({ conversationId, onMessageSent }: ChatMessageInputProps) => {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearPreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !preview) || !user) return;

    const text = newMessage.trim();
    setNewMessage("");

    let file_url: string | null = null;
    let file_type: string | null = null;

    if (preview) {
      setUploading(true);
      const ext = preview.file.name.split(".").pop() || "bin";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("chat-files").upload(path, preview.file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
        file_url = urlData.publicUrl;
        file_type = preview.file.type.startsWith("video/") ? "video" : "image";
      }
      clearPreview();
      setUploading(false);
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      text: text || (file_type === "video" ? "🎥 Видео" : "📷 Фото"),
      file_url,
      file_type,
    });

    onMessageSent?.();
  };

  return (
    <form onSubmit={handleSend} className="shrink-0 border-t border-border bg-card/80 backdrop-blur-md p-3">
      {preview && (
        <div className="mb-2 relative inline-block">
          {preview.file.type.startsWith("video/") ? (
            <video src={preview.url} className="h-20 rounded-lg" />
          ) : (
            <img src={preview.url} alt="" className="h-20 rounded-lg object-cover" />
          )}
          <button type="button" onClick={clearPreview} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="flex gap-2 items-center">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors shrink-0">
          <ImagePlus className="w-4 h-4" />
        </button>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFileSelect} className="hidden" />
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Написать сообщение..."
          className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-accent/30 transition-all"
        />
        <button type="submit" disabled={(!newMessage.trim() && !preview) || uploading}
          className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </form>
  );
};

export default ChatMessageInput;
