
-- Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Validation function first
CREATE OR REPLACE FUNCTION public.validate_conversation_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type NOT IN ('direct', 'group', 'general') THEN
    RAISE EXCEPTION 'Invalid conversation type: %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

-- Chat conversations table
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'group',
  name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER validate_conversation_type
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_type();

-- Conversation members
CREATE TABLE public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations RLS
CREATE POLICY "View conversations in own company"
ON public.conversations FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Members can create conversations"
ON public.conversations FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Creator or admin can update conversation"
ON public.conversations FOR UPDATE
USING (company_id = get_user_company_id(auth.uid()) AND (created_by = auth.uid() OR is_company_admin(auth.uid(), company_id)));

CREATE POLICY "Creator or admin can delete conversation"
ON public.conversations FOR DELETE
USING (company_id = get_user_company_id(auth.uid()) AND (created_by = auth.uid() OR is_company_admin(auth.uid(), company_id)));

-- Conversation members RLS
CREATE POLICY "View members of own company conversations"
ON public.conversation_members FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_id AND c.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Add members to own company conversations"
ON public.conversation_members FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_id AND c.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Remove members from own company conversations"
ON public.conversation_members FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_id AND c.company_id = get_user_company_id(auth.uid())
));

-- Messages RLS
CREATE POLICY "View messages in own company conversations"
ON public.messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_id AND c.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Send messages in own company conversations"
ON public.messages FOR INSERT
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_id AND c.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Delete own messages"
ON public.messages FOR DELETE
USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Updated_at trigger
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
