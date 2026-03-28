import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push helpers using Web Crypto API (no npm deps needed in Deno)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateVapidAuthHeader(
  audience: string,
  subject: string,
  privateKeyBase64: string,
  publicKeyBase64: string,
): Promise<{ authorization: string; cryptoKey: string }> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };

  const encodeJson = (obj: unknown) => uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsignedToken = `${encodeJson(header)}.${encodeJson(payload)}`;

  // Import private key
  const rawKey = urlBase64ToUint8Array(privateKeyBase64);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    rawKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  ).catch(async () => {
    // Try JWK format if PKCS8 fails
    const jwk = {
      kty: "EC",
      crv: "P-256",
      d: privateKeyBase64,
      x: publicKeyBase64.substring(0, 43),
      y: publicKeyBase64.substring(43),
    };
    return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  });

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );

  const sig = uint8ArrayToBase64Url(new Uint8Array(signature));
  const jwt = `${unsignedToken}.${sig}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKeyBase64}`,
    cryptoKey: publicKeyBase64,
  };
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<{ success: boolean; status?: number; removed?: boolean }> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;

    // For simplicity, send as plaintext payload (not encrypted)
    // Browsers require encryption, so we use a simple fetch with VAPID
    const vapid = await generateVapidAuthHeader(audience, vapidSubject, vapidPrivateKey, vapidPublicKey);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTL": "60",
        Authorization: vapid.authorization,
        "Crypto-Key": `p256ecdsa=${vapid.cryptoKey}`,
      },
      body: payload,
    });

    if (response.status === 410 || response.status === 404) {
      return { success: false, status: response.status, removed: true };
    }

    return { success: response.ok, status: response.status };
  } catch (e) {
    console.error("sendWebPush error:", e);
    return { success: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { targetUserIds, notification } = await req.json();

    if (!targetUserIds?.length || !notification?.title) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: corsHeaders });
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("VAPID keys not configured, skipping push");
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no_vapid_keys" }), { headers: corsHeaders });
    }

    // Get subscriptions for target users
    const { data: subs, error: subError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("user_id", targetUserIds);

    if (subError) {
      console.error("Fetch subs error:", subError);
      return new Response(JSON.stringify({ error: subError.message }), { status: 500, headers: corsHeaders });
    }

    if (!subs?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no_subscriptions" }), { headers: corsHeaders });
    }

    const payload = JSON.stringify(notification);
    let sent = 0;
    const toRemove: string[] = [];

    for (const sub of subs) {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapidPublicKey,
        vapidPrivateKey,
        vapidSubject,
      );

      if (result.success) {
        sent++;
      } else if (result.removed) {
        toRemove.push(sub.id);
      }
    }

    // Clean up expired subscriptions
    if (toRemove.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", toRemove);
    }

    return new Response(JSON.stringify({ ok: true, sent, total: subs.length, removed: toRemove.length }), {
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("push-notify error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
