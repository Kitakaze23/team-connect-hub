import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const admins = [
    { email: "maverick@platform.admin", password: "1234567", name: "Maverick" },
    { email: "mardoc@platform.admin", password: "12345678", name: "Mardoc" },
  ];

  const results = [];

  for (const admin of admins) {
    // Check if user already exists
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existing = users?.find((u) => u.email === admin.email);

    let userId: string;

    if (existing) {
      userId = existing.id;
      results.push({ email: admin.email, status: "already_exists", userId });
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: admin.email,
        password: admin.password,
        email_confirm: true,
        user_metadata: { first_name: admin.name, last_name: "Admin" },
      });

      if (error) {
        results.push({ email: admin.email, status: "error", error: error.message });
        continue;
      }

      userId = data.user.id;

      // Update profile
      await supabaseAdmin
        .from("profiles")
        .update({ first_name: admin.name, last_name: "Admin" })
        .eq("user_id", userId);

      results.push({ email: admin.email, status: "created", userId });
    }

    // Ensure platform_admin role
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (!existingRole) {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userId, role: "platform_admin" },
        { onConflict: "user_id,role" }
      );
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
