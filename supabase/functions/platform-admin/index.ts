import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

        const { data: teams } = await supabaseAdmin
          .from("teams")
          .select("id, name")
          .eq("company_id", company_id)
          .order("name");

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

      case "create_company": {
        const { name, owner_email, owner_password } = params;

        const normalizedEmail = String(owner_email || "").trim().toLowerCase();
        const normalizedName = String(name || "").trim();
        const normalizedPassword = String(owner_password || "");
        const emailRegex = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

        if (!normalizedName) {
          return new Response(JSON.stringify({ error: "Название компании обязательно" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!emailRegex.test(normalizedEmail)) {
          return new Response(JSON.stringify({ error: "Некорректный email владельца. Используйте формат name@company.com (латиница)." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (normalizedPassword.length < 6) {
          return new Response(JSON.stringify({ error: "Пароль владельца должен быть минимум 6 символов" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create user for the owner
        const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password: normalizedPassword,
          email_confirm: true,
        });

        if (createUserError) throw createUserError;

        const ownerId = newUser.user.id;

        // Wait for trigger to create profile & role
        await new Promise((r) => setTimeout(r, 500));

        // Create company
        const { data: company, error: companyError } = await supabaseAdmin
          .from("companies")
          .insert({ name: normalizedName, owner_id: ownerId })
          .select()
          .single();

        if (companyError) throw companyError;

        // Add owner as approved admin member
        await supabaseAdmin
          .from("company_members")
          .insert({ company_id: company.id, user_id: ownerId, status: "approved", role: "admin" });

        // Update user_roles to admin
        await supabaseAdmin
          .from("user_roles")
          .update({ role: "admin" })
          .eq("user_id", ownerId);

        // Update profile with company_id
        await supabaseAdmin
          .from("profiles")
          .update({ company_id: company.id })
          .eq("user_id", ownerId);

        // Audit log
        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "create_company",
          target_type: "company",
          target_id: company.id,
          details: { name: normalizedName, owner_email: normalizedEmail },
        });

        result = { success: true, company_id: company.id };
        break;
      }

      case "create_company_existing_owner": {
        const { name, owner_user_id } = params;

        // Create company with existing user as owner
        const { data: company, error: companyError } = await supabaseAdmin
          .from("companies")
          .insert({ name, owner_id: owner_user_id })
          .select()
          .single();

        if (companyError) throw companyError;

        // Add owner as approved admin member
        await supabaseAdmin
          .from("company_members")
          .insert({ company_id: company.id, user_id: owner_user_id, status: "approved", role: "admin" });

        // Update user_roles to admin
        await supabaseAdmin
          .from("user_roles")
          .update({ role: "admin" })
          .eq("user_id", owner_user_id);

        // Update profile
        await supabaseAdmin
          .from("profiles")
          .update({ company_id: company.id })
          .eq("user_id", owner_user_id);

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "create_company",
          target_type: "company",
          target_id: company.id,
          details: { name, owner_user_id },
        });

        result = { success: true, company_id: company.id };
        break;
      }

      case "suspend_company": {
        const { company_id } = params;
        const { error } = await supabaseAdmin
          .from("companies")
          .update({ status: "suspended" })
          .eq("id", company_id);

        if (error) throw error;

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "suspend_company",
          target_type: "company",
          target_id: company_id,
          details: {},
        });

        result = { success: true };
        break;
      }

      case "activate_company": {
        const { company_id } = params;
        const { error } = await supabaseAdmin
          .from("companies")
          .update({ status: "active" })
          .eq("id", company_id);

        if (error) throw error;

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "activate_company",
          target_type: "company",
          target_id: company_id,
          details: {},
        });

        result = { success: true };
        break;
      }

      case "update_company_name": {
        const { company_id, name } = params;
        const { error } = await supabaseAdmin
          .from("companies")
          .update({ name })
          .eq("id", company_id);

        if (error) throw error;

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

      case "update_user_name": {
        const { target_user_id, first_name, last_name } = params;
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ first_name, last_name })
          .eq("user_id", target_user_id);

        if (error) throw error;

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "update_user_name",
          target_type: "user",
          target_id: target_user_id,
          details: { first_name, last_name },
        });

        result = { success: true };
        break;
      }

      case "set_user_role": {
        const { target_user_id, company_id, new_role } = params;
        // Update company_members role
        const { error: memberError } = await supabaseAdmin
          .from("company_members")
          .update({ role: new_role })
          .eq("user_id", target_user_id)
          .eq("company_id", company_id);

        if (memberError) throw memberError;

        // Update user_roles
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .update({ role: new_role })
          .eq("user_id", target_user_id);

        if (roleError) throw roleError;

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "set_user_role",
          target_type: "user",
          target_id: target_user_id,
          details: { company_id, new_role },
        });

        result = { success: true };
        break;
      }

      case "delete_company": {
        const { company_id } = params;

        // Delete all related data in order
        await supabaseAdmin.from("desk_assignments").delete().eq("company_id", company_id);
        await supabaseAdmin.from("desks").delete().eq("company_id", company_id);
        await supabaseAdmin.from("work_schedules").delete().eq("company_id", company_id);
        await supabaseAdmin.from("vacations").delete().eq("company_id", company_id);
        await supabaseAdmin.from("sick_leaves").delete().eq("company_id", company_id);
        await supabaseAdmin.from("call_debug_logs").delete().eq("company_id", company_id);
        await supabaseAdmin.from("call_logs").delete().eq("company_id", company_id);

        // Delete backlog data
        const { data: bTasks } = await supabaseAdmin.from("backlog_tasks").select("id").eq("company_id", company_id);
        const taskIds = (bTasks || []).map(t => t.id);
        if (taskIds.length > 0) {
          const { data: bStages } = await supabaseAdmin.from("backlog_task_stages").select("id").in("task_id", taskIds);
          const stageIds = (bStages || []).map(s => s.id);
          if (stageIds.length > 0) {
            await supabaseAdmin.from("backlog_stage_links").delete().in("stage_id", stageIds);
          }
          await supabaseAdmin.from("backlog_task_stages").delete().in("task_id", taskIds);
          await supabaseAdmin.from("backlog_task_comments").delete().in("task_id", taskIds);
          await supabaseAdmin.from("backlog_task_dependencies").delete().in("task_id", taskIds);
        }
        await supabaseAdmin.from("backlog_tasks").delete().eq("company_id", company_id);
        await supabaseAdmin.from("backlog_milestones").delete().eq("company_id", company_id);

        // Delete conversations and messages
        const { data: convos } = await supabaseAdmin.from("conversations").select("id").eq("company_id", company_id);
        const convoIds = (convos || []).map(c => c.id);
        if (convoIds.length > 0) {
          await supabaseAdmin.from("messages").delete().in("conversation_id", convoIds);
          await supabaseAdmin.from("conversation_members").delete().in("conversation_id", convoIds);
        }
        await supabaseAdmin.from("conversations").delete().eq("company_id", company_id);

        // Delete teams
        await supabaseAdmin.from("teams").delete().eq("company_id", company_id);

        // Clear profile company_id for members
        const { data: members } = await supabaseAdmin.from("company_members").select("user_id").eq("company_id", company_id);
        const memberUserIds = (members || []).map(m => m.user_id);
        if (memberUserIds.length > 0) {
          await supabaseAdmin.from("profiles").update({ company_id: null }).in("user_id", memberUserIds);
          // Reset roles to 'user'
          await supabaseAdmin.from("user_roles").update({ role: "user" }).in("user_id", memberUserIds);
        }

        // Delete company members
        await supabaseAdmin.from("company_members").delete().eq("company_id", company_id);

        // Delete company
        const { error } = await supabaseAdmin.from("companies").delete().eq("id", company_id);
        if (error) throw error;

        await supabaseAdmin.from("admin_audit_logs").insert({
          admin_user_id: user.id,
          action: "delete_company",
          target_type: "company",
          target_id: company_id,
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
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
