import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: string[] = [];

  // Create admin user
  const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
    email: "admin@test.ru",
    password: "123456",
    email_confirm: true,
  });

  if (adminError) {
    results.push(`Admin error: ${adminError.message}`);
  } else {
    // Update profile
    await supabaseAdmin.from("profiles").update({
      first_name: "Админ",
      last_name: "Тестовый",
      position: "Системный администратор",
      team: "Разработка",
    }).eq("user_id", adminData.user.id);

    // Add admin role
    await supabaseAdmin.from("user_roles").insert({
      user_id: adminData.user.id,
      role: "admin",
    });

    results.push(`Admin created: ${adminData.user.id}`);
  }

  // Create regular user
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email: "user@test.ru",
    password: "123456",
    email_confirm: true,
  });

  if (userError) {
    results.push(`User error: ${userError.message}`);
  } else {
    await supabaseAdmin.from("profiles").update({
      first_name: "Пользователь",
      last_name: "Тестовый",
      position: "Менеджер",
      team: "Маркетинг",
    }).eq("user_id", userData.user.id);

    results.push(`User created: ${userData.user.id}`);
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
