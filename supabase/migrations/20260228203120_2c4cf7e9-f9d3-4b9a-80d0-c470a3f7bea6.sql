-- Allow conversation creator or company admin to delete all messages in a conversation
DROP POLICY IF EXISTS "Delete own messages" ON public.messages;

CREATE POLICY "Delete own messages or admin/creator can delete"
ON public.messages
FOR DELETE
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (c.created_by = auth.uid() OR is_company_admin(auth.uid(), c.company_id))
  )
);