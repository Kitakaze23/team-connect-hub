import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "BBWSD7DIRwZZEtXQUmo3TiCD87L-lL_R9j8W7lq_dnu9qdQFMCZIB_mUfaH1voTCB3e_ad9COsgUuBX5-neMgcY";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

export function usePushNotifications(userId: string | undefined) {
  const registeredRef = useRef(false);

  const register = useCallback(async () => {
    if (!userId || !VAPID_PUBLIC_KEY || registeredRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Don't register in iframe / preview
    try {
      if (window.self !== window.top) return;
    } catch {
      return;
    }
    if (window.location.hostname.includes("id-preview--")) return;

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.functions.invoke("push-subscribe", {
        body: {
          action: "subscribe",
          subscription: {
            endpoint: sub.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))),
              auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))),
            },
          },
        },
      });

      registeredRef.current = true;
      console.log("[Push] Subscription registered");
    } catch (e) {
      console.warn("[Push] Registration failed:", e);
    }
  }, [userId]);

  useEffect(() => {
    register();
  }, [register]);

  const sendPushToUsers = useCallback(
    async (
      targetUserIds: string[],
      notification: { type: string; title: string; body: string; data?: Record<string, unknown> }
    ) => {
      if (!targetUserIds.length) return;
      try {
        await supabase.functions.invoke("push-notify", {
          body: { targetUserIds, notification },
        });
      } catch (e) {
        console.warn("[Push] Send failed:", e);
      }
    },
    []
  );

  return { sendPushToUsers };
}
