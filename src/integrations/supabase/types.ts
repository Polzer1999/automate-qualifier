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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "lead_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_calls_knowledge: {
        Row: {
          besoin: string | null
          contexte: string | null
          created_at: string | null
          entreprise: string | null
          id: string
          import_batch_id: string | null
          phase_1_introduction: string | null
          phase_2_exploration: string | null
          phase_3_affinage: string | null
          phase_4_next_steps: string | null
          raw_data: Json | null
          secteur: string | null
        }
        Insert: {
          besoin?: string | null
          contexte?: string | null
          created_at?: string | null
          entreprise?: string | null
          id?: string
          import_batch_id?: string | null
          phase_1_introduction?: string | null
          phase_2_exploration?: string | null
          phase_3_affinage?: string | null
          phase_4_next_steps?: string | null
          raw_data?: Json | null
          secteur?: string | null
        }
        Update: {
          besoin?: string | null
          contexte?: string | null
          created_at?: string | null
          entreprise?: string | null
          id?: string
          import_batch_id?: string | null
          phase_1_introduction?: string | null
          phase_2_exploration?: string | null
          phase_3_affinage?: string | null
          phase_4_next_steps?: string | null
          raw_data?: Json | null
          secteur?: string | null
        }
        Relationships: []
      }
      lead_conversations: {
        Row: {
          created_at: string
          id: string
          is_qualified: boolean | null
          lead_id: string | null
          qualification_data: Json | null
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_qualified?: boolean | null
          lead_id?: string | null
          qualification_data?: Json | null
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_qualified?: boolean | null
          lead_id?: string | null
          qualification_data?: Json | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "parrita_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_webhooks: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_event: string
          updated_at: string | null
          webhook_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_event: string
          updated_at?: string | null
          webhook_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_event?: string
          updated_at?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      parrita_leads: {
        Row: {
          calcom_link_clicked: boolean | null
          context_summary: string | null
          created_at: string | null
          estimated_time_spent_per_week_hours: number | null
          iai_maturity_level: number | null
          id: string
          interest_level: string | null
          lead_company: string | null
          lead_company_size: string | null
          lead_email: string | null
          lead_name: string | null
          lead_phone: string | null
          lead_role: string | null
          lead_sector: string | null
          main_pain_points: Json | null
          preferred_next_step: string | null
          tasks_to_automate: Json | null
        }
        Insert: {
          calcom_link_clicked?: boolean | null
          context_summary?: string | null
          created_at?: string | null
          estimated_time_spent_per_week_hours?: number | null
          iai_maturity_level?: number | null
          id?: string
          interest_level?: string | null
          lead_company?: string | null
          lead_company_size?: string | null
          lead_email?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          lead_role?: string | null
          lead_sector?: string | null
          main_pain_points?: Json | null
          preferred_next_step?: string | null
          tasks_to_automate?: Json | null
        }
        Update: {
          calcom_link_clicked?: boolean | null
          context_summary?: string | null
          created_at?: string | null
          estimated_time_spent_per_week_hours?: number | null
          iai_maturity_level?: number | null
          id?: string
          interest_level?: string | null
          lead_company?: string | null
          lead_company_size?: string | null
          lead_email?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          lead_role?: string | null
          lead_sector?: string | null
          main_pain_points?: Json | null
          preferred_next_step?: string | null
          tasks_to_automate?: Json | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string | null
          id: string
          request_count: number | null
          session_id: string
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          request_count?: number | null
          session_id: string
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          request_count?: number | null
          session_id?: string
          window_start?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
