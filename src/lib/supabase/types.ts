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
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          changes: Json | null
          created_at: string | null
          description: string | null
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string | null
          description?: string | null
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          changes?: Json | null
          created_at?: string | null
          description?: string | null
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cashback_transactions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          event_id: string | null
          id: string
          participant_id: string | null
          type: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          participant_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          participant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_transactions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          activity: string | null
          auth_user_id: string | null
          cashback_balance: number | null
          community_approved: boolean
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
          auth_user_id?: string | null
          cashback_balance?: number | null
          community_approved?: boolean
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
          auth_user_id?: string | null
          cashback_balance?: number | null
          community_approved?: boolean
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
      department_heads: {
        Row: {
          assigned_at: string | null
          department: Database["public"]["Enums"]["department_type"]
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          department: Database["public"]["Enums"]["department_type"]
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          department?: Database["public"]["Enums"]["department_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_heads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpi_targets: {
        Row: {
          created_at: string | null
          events_target: number | null
          id: string
          leads_target: number | null
          notes: string | null
          period_month: number
          period_year: number
          revenue_target: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          events_target?: number | null
          id?: string
          leads_target?: number | null
          notes?: string | null
          period_month: number
          period_year: number
          revenue_target?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          events_target?: number | null
          id?: string
          leads_target?: number | null
          notes?: string | null
          period_month?: number
          period_year?: number
          revenue_target?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpi_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_participants: {
        Row: {
          activity: string | null
          attended: boolean
          cashback_earned: number | null
          cashback_percent: number | null
          cashback_used: number | null
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
          skip_cashback_award: boolean | null
          sort_order: number | null
          status: string | null
        }
        Insert: {
          activity?: string | null
          attended?: boolean
          cashback_earned?: number | null
          cashback_percent?: number | null
          cashback_used?: number | null
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
          skip_cashback_award?: boolean | null
          sort_order?: number | null
          status?: string | null
        }
        Update: {
          activity?: string | null
          attended?: boolean
          cashback_earned?: number | null
          cashback_percent?: number | null
          cashback_used?: number | null
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
          skip_cashback_award?: boolean | null
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
          cashback_percent: number | null
          cover_image: string | null
          created_at: string | null
          date: string | null
          description: string | null
          id: string
          is_active: boolean | null
          location: string | null
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          cashback_percent?: number | null
          cover_image?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name: string
          price?: number
          updated_at?: string | null
        }
        Update: {
          cashback_percent?: number | null
          cover_image?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name?: string
          price?: number
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
      news_posts: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_published: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          note: string | null
          paid_at: string
          participant_id: string
          recorded_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          note?: string | null
          paid_at?: string
          participant_id: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          participant_id?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "event_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bio: string | null
          birth_date: string | null
          created_at: string | null
          department: Database["public"]["Enums"]["department_type"] | null
          email: string
          emergency_contact: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          phone: string | null
          position: string | null
          role: string
          telegram: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          created_at?: string | null
          department?: Database["public"]["Enums"]["department_type"] | null
          email: string
          emergency_contact?: string | null
          full_name: string
          hire_date?: string | null
          id: string
          is_active?: boolean | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string
          telegram?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_date?: string | null
          created_at?: string | null
          department?: Database["public"]["Enums"]["department_type"] | null
          email?: string
          emergency_contact?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          role?: string
          telegram?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          id: string
          module: string
          user_id: string | null
        }
        Insert: {
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module: string
          user_id?: string | null
        }
        Update: {
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      calculate_employee_kpi_actual: {
        Args: { p_month: number; p_user_id: string; p_year: number }
        Returns: {
          events_managed: number
          leads_closed: number
          revenue_actual: number
        }[]
      }
      cleanup_old_activity_logs: { Args: never; Returns: undefined }
      get_current_actor: {
        Args: never
        Returns: {
          actor_email: string
          actor_id: string
          actor_name: string
          actor_role: string
        }[]
      }
      has_permission: {
        Args: { p_module: string; p_user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_staff: { Args: { p_user_id: string }; Returns: boolean }
      member_update_profile: {
        Args: {
          p_activity?: string
          p_company?: string
          p_full_name?: string
          p_industry?: string
          p_phone?: string
        }
        Returns: undefined
      }
      my_client_id: { Args: never; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      register_for_event: { Args: { p_event_id: string }; Returns: string }
      setup_google_member: {
        Args: { p_company: string; p_full_name: string; p_phone: string }
        Returns: string
      }
      spend_cashback: {
        Args: {
          p_amount: number
          p_client_id: string
          p_event_id: string
          p_participant_id: string
        }
        Returns: undefined
      }
      close_crm_lead_won: {
        Args: { p_lead_id: string }
        Returns: Json
      }
    }
    Enums: {
      call_type: "answered" | "missed" | "none"
      department_type:
        | "marketing"
        | "sotuv"
        | "buxgalteriya"
        | "operatsion"
        | "it"
        | "hr"
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
      department_type: [
        "marketing",
        "sotuv",
        "buxgalteriya",
        "operatsion",
        "it",
        "hr",
      ],
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

