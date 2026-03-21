-- Add backlog toggle to companies
ALTER TABLE public.companies ADD COLUMN backlog_enabled boolean NOT NULL DEFAULT true;

-- Add file support to messages
ALTER TABLE public.messages ADD COLUMN file_url text DEFAULT NULL;
ALTER TABLE public.messages ADD COLUMN file_type text DEFAULT NULL;

-- Create chat-files storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files', 'chat-files', true);

-- RLS for chat-files bucket
CREATE POLICY "Authenticated users can upload chat files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-files');

CREATE POLICY "Anyone can view chat files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-files');

CREATE POLICY "Users can delete own chat files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-files' AND (storage.foldername(name))[1] = auth.uid()::text);