export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      backlog_milestones: {
        Row: {
          company_id: string
          created_at: string
          date: string
          id: string
          milestone_type: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          id?: string
          milestone_type?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          milestone_type?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlog_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backlog_stage_links: {
        Row: {
          created_at: string
          id: string
          label: string | null
          stage_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          stage_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          stage_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlog_stage_links_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "backlog_task_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      backlog_task_comments: {
        Row: {
          created_at: string
          id: string
          task_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlog_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "backlog_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      backlog_task_dependencies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          release_date: string | null
          status: string
          task_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          release_date?: string | null
          status?: string
          task_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          release_date?: string | null
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlog_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "backlog_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      backlog_task_stages: {
        Row: {
          created_at: string
          end_date: string
          id: string
          sort_order: number
          stage_name: string
          start_date: string
          task_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          sort_order?: number
          stage_name: string
          start_date: string
          task_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          sort_order?: number
          stage_name?: string
          start_date?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlog_task_stages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "backlog_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      backlog_tasks: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          has_dependencies: boolean
          id: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          has_dependencies?: boolean
          id?: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          has_dependencies?: boolean
          id?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlog_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          call_type: string
          caller_id: string
          company_id: string
          conversation_id: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          call_type?: string
          caller_id: string
          company_id: string
          conversation_id: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Update: {
          call_type?: string
          caller_id?: string
          company_id?: string
          conversation_id?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          desk_sharing_enabled: boolean
          floor_plan_url: string | null
          id: string
          invite_code: string | null
          name: string
          owner_id: string
          sprint_length_days: number
          sprint_start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desk_sharing_enabled?: boolean
          floor_plan_url?: string | null
          id?: string
          invite_code?: string | null
          name: string
          owner_id: string
          sprint_length_days?: number
          sprint_start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desk_sharing_enabled?: boolean
          floor_plan_url?: string | null
          id?: string
          invite_code?: string | null
          name?: string
          owner_id?: string
          sprint_length_days?: number
          sprint_start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      desk_assignments: {
        Row: {
          company_id: string
          created_at: string
          day_of_week: string
          desk_id: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          day_of_week?: string
          desk_id: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          day_of_week?: string
          desk_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "desk_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desk_assignments_desk_id_fkey"
            columns: ["desk_id"]
            isOneToOne: false
            referencedRelation: "desks"
            referencedColumns: ["id"]
          },
        ]
      }
      desks: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "desks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          pinned: boolean | null
          text: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          pinned?: boolean | null
          text: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          pinned?: boolean | null
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birthday: string | null
          city: string | null
          company_id: string | null
          created_at: string
          desk: string | null
          first_name: string
          id: string
          last_name: string
          messenger: string | null
          middle_name: string | null
          phone: string | null
          position: string | null
          team: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          birthday?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          desk?: string | null
          first_name?: string
          id?: string
          last_name?: string
          messenger?: string | null
          middle_name?: string | null
          phone?: string | null
          position?: string | null
          team?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          birthday?: string | null
          city?: string | null
          company_id?: string | null
          created_at?: string
          desk?: string | null
          first_name?: string
          id?: string
          last_name?: string
          messenger?: string | null
          middle_name?: string | null
          phone?: string | null
          position?: string | null
          team?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sick_leaves: {
        Row: {
          company_id: string
          created_at: string
          end_date: string
          id: string
          start_date: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          start_date: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sick_leaves_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacations: {
        Row: {
          company_id: string
          created_at: string
          end_date: string
          id: string
          start_date: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          start_date: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          company_id: string
          fri: string
          id: string
          mon: string
          sat: string
          sun: string
          thu: string
          tue: string
          updated_at: string
          user_id: string
          wed: string
        }
        Insert: {
          company_id: string
          fri?: string
          id?: string
          mon?: string
          sat?: string
          sun?: string
          thu?: string
          tue?: string
          updated_at?: string
          user_id: string
          wed?: string
        }
        Update: {
          company_id?: string
          fri?: string
          id?: string
          mon?: string
          sat?: string
          sun?: string
          thu?: string
          tue?: string
          updated_at?: string
          user_id?: string
          wed?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_company_by_code: {
        Args: { _code: string }
        Returns: {
          id: string
          name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "platform_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "platform_admin"],
    },
  },
} as const
