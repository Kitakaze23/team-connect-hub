import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useCallLogger = () => {
  const sessionIdRef = useRef<string>("");
  const userIdRef = useRef<string>("");
  const companyIdRef = useRef<string>("");

  const initSession = useCallback((userId: string, companyId: string) => {
    sessionIdRef.current = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    userIdRef.current = userId;
    companyIdRef.current = companyId;
    return sessionIdRef.current;
  }, []);

  const log = useCallback(async (event: string, details?: Record<string, any>) => {
    if (!userIdRef.current || !companyIdRef.current) return;
    try {
      await supabase.from("call_debug_logs").insert({
        company_id: companyIdRef.current,
        user_id: userIdRef.current,
        call_session_id: sessionIdRef.current,
        event,
        details: details || {},
      } as any);
    } catch (e) {
      console.warn("[CallLogger] Failed to write log:", e);
    }
  }, []);

  const reset = useCallback(() => {
    sessionIdRef.current = "";
  }, []);

  return { log, initSession, reset, getSessionId: () => sessionIdRef.current };
};
