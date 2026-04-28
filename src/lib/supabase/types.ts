export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      amocrm_leads: {
        Row: {
          company_name: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: number | null
          custom_fields: Json | null
          id: number
          name: string | null
          pipeline_id: number | null
          price: number | null
          raw: Json | null
          responsible_user_id: number | null
          responsible_user_name: string | null
          status_id: number | null
          synced_at: string | null
          tags: Json | null
          updated_at: number | null
        }
        Insert: {
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: number | null
          custom_fields?: Json | null
          id: number
          name?: string | null
          pipeline_id?: number | null
          price?: number | null
          raw?: Json | null
          responsible_user_id?: number | null
          responsible_user_name?: string | null
          status_id?: number | null
          synced_at?: string | null
          tags?: Json | null
          updated_at?: number | null
        }
        Update: {
          company_name?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: number | null
          custom_fields?: Json | null
          id?: number
          name?: string | null
          pipeline_id?: number | null
          price?: number | null
          raw?: Json | null
          responsible_user_id?: number | null
          responsible_user_name?: string | null
          status_id?: number | null
          synced_at?: string | null
          tags?: Json | null
          updated_at?: number | null
        }
        Relationships: []
      }
      amocrm_pipelines: {
        Row: {
          id: number
          name: string | null
          statuses: Json | null
          synced_at: string | null
        }
        Insert: {
          id: number
          name?: string | null
          statuses?: Json | null
          synced_at?: string | null
        }
        Update: {
          id?: number
          name?: string | null
          statuses?: Json | null
          synced_at?: string | null
        }
        Relationships: []
      }
      amocrm_sync_log: {
        Row: {
          error: string | null
          id: string
          leads_count: number | null
          pipelines_count: number | null
          synced_at: string | null
        }
        Insert: {
          error?: string | null
          id?: string
          leads_count?: number | null
          pipelines_count?: number | null
          synced_at?: string | null
        }
        Update: {
          error?: string | null
          id?: string
          leads_count?: number | null
          pipelines_count?: number | null
          synced_at?: string | null
        }
        Relationships: []
      }
      amocrm_tokens: {
        Row: {
          access_token: string
          expires_at: string
          id: number
          refresh_token: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          expires_at: string
          id?: number
          refresh_token?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          expires_at?: string
          id?: number
          refresh_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      amocrm_users: {
        Row: {
          email: string | null
          id: number
          name: string | null
          synced_at: string | null
        }
        Insert: {
          email?: string | null
          id: number
          name?: string | null
          synced_at?: string | null
        }
        Update: {
          email?: string | null
          id?: number
          name?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          activity: string | null
          company: string | null
          created_at: string
          email: string | null
          events_count: number
          full_name: string
          id: string
          image: string | null
          industry: string | null
          join_date: string | null
          phone: string | null
          revenue: string | null
          role: string | null
          status: string
          total_spent: number
          updated_at: string
        }
        Insert: {
          activity?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          events_count?: number
          full_name: string
          id?: string
          image?: string | null
          industry?: string | null
          join_date?: string | null
          phone?: string | null
          revenue?: string | null
          role?: string | null
          status?: string
          total_spent?: number
          updated_at?: string
        }
        Update: {
          activity?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          events_count?: number
          full_name?: string
          id?: string
          image?: string | null
          industry?: string | null
          join_date?: string | null
          phone?: string | null
          revenue?: string | null
          role?: string | null
          status?: string
          total_spent?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          contact_id: string | null
          created_at: string | null
          id: string
          is_lost: boolean | null
          is_won: boolean | null
          loss_reason: string | null
          name: string
          pipeline_id: string | null
          price: number | null
          responsible_user_id: number | null
          source: string | null
          stage_id: string | null
          tags: Json | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          loss_reason?: string | null
          name: string
          pipeline_id?: string | null
          price?: number | null
          responsible_user_id?: number | null
          source?: string | null
          stage_id?: string | null
          tags?: Json | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          loss_reason?: string | null
          name?: string
          pipeline_id?: string | null
          price?: number | null
          responsible_user_id?: number | null
          source?: string | null
          stage_id?: string | null
          tags?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "amocrm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          created_at: string | null
          created_by: number | null
          id: string
          lead_id: string | null
          text: string
        }
        Insert: {
          created_at?: string | null
          created_by?: number | null
          id?: string
          lead_id?: string | null
          text: string
        }
        Update: {
          created_at?: string | null
          created_by?: number | null
          id?: string
          lead_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_stages: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_lost: boolean | null
          is_won: boolean | null
          name: string
          pipeline_id: string | null
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          name: string
          pipeline_id?: string | null
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_lost?: boolean | null
          is_won?: boolean | null
          name?: string
          pipeline_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          created_at: string | null
          created_by: number | null
          due_date: string | null
          id: string
          is_done: boolean | null
          lead_id: string | null
          text: string
        }
        Insert: {
          created_at?: string | null
          created_by?: number | null
          due_date?: string | null
          id?: string
          is_done?: boolean | null
          lead_id?: string | null
          text: string
        }
        Update: {
          created_at?: string | null
          created_by?: number | null
          due_date?: string | null
          id?: string
          is_done?: boolean | null
          lead_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          activity: string | null
          attended: boolean
          company: string | null
          contact_id: string | null
          created_at: string | null
          email: string | null
          event_id: string | null
          full_name: string
          id: string
          industry: string | null
          notes: string | null
          paid: number
          phone: string | null
          photo_url: string | null
          price: number
          revenue: string | null
          role: string | null
          sort_order: number | null
          status: string | null
        }
        Insert: {
          activity?: string | null
          attended?: boolean
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          email?: string | null
          event_id?: string | null
          full_name: string
          id?: string
          industry?: string | null
          notes?: string | null
          paid?: number
          phone?: string | null
          photo_url?: string | null
          price?: number
          revenue?: string | null
          role?: string | null
          sort_order?: number | null
          status?: string | null
        }
        Update: {
          activity?: string | null
          attended?: boolean
          company?: string | null
          contact_id?: string | null
          created_at?: string | null
          email?: string | null
          event_id?: string | null
          full_name?: string
          id?: string
          industry?: string | null
          notes?: string | null
          paid?: number
          phone?: string | null
          photo_url?: string | null
          price?: number
          revenue?: string | null
          role?: string | null
          sort_order?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cover_image: string | null
          created_at: string | null
          date: string | null
          description: string | null
          id: string
          is_active: boolean | null
          location: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          cover_image?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          cover_image?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          amo_id: string | null
          amount: number
          company: string | null
          created_at: string
          id: string
          last_call_time: string | null
          last_call_type: Database["public"]["Enums"]["call_type"]
          name: string
          responsible_color: string
          responsible_initials: string
          responsible_name: string
          source: Database["public"]["Enums"]["lead_source"]
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
        }
        Insert: {
          amo_id?: string | null
          amount?: number
          company?: string | null
          created_at?: string
          id?: string
          last_call_time?: string | null
          last_call_type?: Database["public"]["Enums"]["call_type"]
          name: string
          responsible_color?: string
          responsible_initials: string
          responsible_name: string
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Update: {
          amo_id?: string | null
          amount?: number
          company?: string | null
          created_at?: string
          id?: string
          last_call_time?: string | null
          last_call_type?: Database["public"]["Enums"]["call_type"]
          name?: string
          responsible_color?: string
          responsible_initials?: string
          responsible_name?: string
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          id: string
          lead_id: string | null
          processed: boolean
          raw_body: Json
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id?: string | null
          processed?: boolean
          raw_body?: Json
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string | null
          processed?: boolean
          raw_body?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      call_type: "answered" | "missed" | "none"
      lead_source: "amocrm" | "manual" | "telegram"
      lead_stage:
        | "yangi_lid"
        | "boglanildi"
        | "taklif_yuborildi"
        | "muzokara"
        | "yutildi"
        | "yutqazildi"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      call_type: ["answered", "missed", "none"],
      lead_source: ["amocrm", "manual", "telegram"],
      lead_stage: [
        "yangi_lid",
        "boglanildi",
        "taklif_yuborildi",
        "muzokara",
        "yutildi",
        "yutqazildi",
      ],
    },
  },
} as const


// ── Project-specific aliases (preserved for back-compat with existing imports) ──
export type LeadStage = Database["public"]["Enums"]["lead_stage"]
export type LeadSource = Database["public"]["Enums"]["lead_source"]
export type CallType = Database["public"]["Enums"]["call_type"]
export type ClientStatus = "Faol" | "Nofaol"
