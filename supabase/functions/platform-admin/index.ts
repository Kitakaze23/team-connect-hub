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

  // Verify caller is platform_admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check platform_admin role
  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { action, ...params } = await req.json();

  try {
    let result;

    switch (action) {
      case "list_companies": {
        const { data: companies } = await supabaseAdmin
          .from("companies")
          .select("id, name, created_at, status")
          .order("created_at", { ascending: false });

        // Get member counts and team counts
        const enriched = await Promise.all(
          (companies || []).map(async (c) => {
            const { count: memberCount } = await supabaseAdmin
              .from("company_members")
              .select("*", { count: "exact", head: true })
              .eq("company_id", c.id)
              .eq("status", "approved");

            const { count: teamCount } = await supabaseAdmin
              .from("teams")
              .select("*", { count: "exact", head: true })
              .eq("company_id", c.id);

            return { ...c, member_count: memberCount || 0, team_count: teamCount || 0 };
          })
        );

        result = enriched;
        break;
      }

      case "get_company_details": {
        const { company_id } = params;

        // Get teams
        const { data: teams } = await supabaseAdmin
          .from("teams")
          .select("id, name")
          .eq("company_id", company_id)
          .order("name");

        // Get all members with profiles
        const { data: members } = await supabaseAdmin
          .from("company_members")
          .select("id, user_id, role, status")
          .eq("company_id", company_id)
          .eq("status", "approved");

        const userIds = (members || []).map((m) => m.user_id);
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id, first_name, last_name, position, team, avatar_url")
          .in("user_id", userIds.length > 0 ? userIds : ["none"]);

        // Get emails from auth
        const usersWithEmail = await Promise.all(
          (members || []).map(async (m) => {
            const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
            const profile = profiles?.find((p) => p.user_id === m.user_id);
            return {
              ...m,
              email: authUser?.email || "",
              profile,
            };
          })
        );

        result = { teams: teams || [], members: usersWithEmail };
        break;
      }

      case "update_company_name": {
        const { company_id, name } = params;
        const { error } = await supabaseAdmin
          .from("companies")
          .update({ name })
          .eq("id", company_id);

        if (error) throw error;

        // Audit log
        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "update_company_name",
          target_type: "company",
          target_id: company_id,
          details: { name },
        });

        result = { success: true };
        break;
      }

      case "update_user_email": {
        const { target_user_id, new_email } = params;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
          email: new_email,
          email_confirm: true,
        });

        if (error) throw error;

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "update_user_email",
          target_type: "user",
          target_id: target_user_id,
          details: { new_email },
        });

        result = { success: true };
        break;
      }

      case "reset_user_password": {
        const { target_user_id, new_password } = params;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
          password: new_password,
        });

        if (error) throw error;

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "reset_user_password",
          target_type: "user",
          target_id: target_user_id,
          details: {},
        });

        result = { success: true };
        break;
      }

      case "search": {
        const { query } = params;
        const q = `%${query}%`;

        const { data: companies } = await supabaseAdmin
          .from("companies")
          .select("id, name")
          .ilike("name", q);

        const { data: teams } = await supabaseAdmin
          .from("teams")
          .select("id, name, company_id")
          .ilike("name", q);

        const { data: profilesByName } = await supabaseAdmin
          .from("profiles")
          .select("user_id, first_name, last_name, company_id")
          .or(`first_name.ilike.${q},last_name.ilike.${q}`);

        // Search by email via auth admin
        const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const emailMatches = (allUsers || [])
          .filter((u) => u.email?.toLowerCase().includes(query.toLowerCase()))
          .map((u) => ({ user_id: u.id, email: u.email }));

        result = {
          companies: companies || [],
          teams: teams || [],
          profiles: profilesByName || [],
          email_matches: emailMatches,
        };
        break;
      }

      case "get_audit_logs": {
        const { data: logs } = await supabaseAdmin
          .from("admin_audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        result = logs || [];
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
