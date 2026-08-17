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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      email_verifications: {
        Row: {
          catch_all: boolean | null
          confidence: number | null
          created_at: string
          disposable: boolean | null
          domain_valid: boolean | null
          email: string
          id: string
          job_id: string | null
          lead_id: string | null
          metadata: Json
          mx_valid: boolean | null
          normalized_email: string
          provider: string
          reason: string | null
          role_account: boolean | null
          smtp_result: string | null
          status: Database["public"]["Enums"]["email_status"]
          syntax_valid: boolean | null
          user_id: string
        }
        Insert: {
          catch_all?: boolean | null
          confidence?: number | null
          created_at?: string
          disposable?: boolean | null
          domain_valid?: boolean | null
          email: string
          id?: string
          job_id?: string | null
          lead_id?: string | null
          metadata?: Json
          mx_valid?: boolean | null
          normalized_email: string
          provider: string
          reason?: string | null
          role_account?: boolean | null
          smtp_result?: string | null
          status: Database["public"]["Enums"]["email_status"]
          syntax_valid?: boolean | null
          user_id?: string
        }
        Update: {
          catch_all?: boolean | null
          confidence?: number | null
          created_at?: string
          disposable?: boolean | null
          domain_valid?: boolean | null
          email?: string
          id?: string
          job_id?: string | null
          lead_id?: string | null
          metadata?: Json
          mx_valid?: boolean | null
          normalized_email?: string
          provider?: string
          reason?: string | null
          role_account?: boolean | null
          smtp_result?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          syntax_valid?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_verifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          counters: Json
          created_at: string
          cursor: number
          error: string | null
          finished_at: string | null
          id: string
          label: string
          params: Json
          payload: Json
          processed: number
          provider: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          total: number
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          counters?: Json
          created_at?: string
          cursor?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          label: string
          params?: Json
          payload?: Json
          processed?: number
          provider?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total?: number
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          attempts?: number
          counters?: Json
          created_at?: string
          cursor?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          label?: string
          params?: Json
          payload?: Json
          processed?: number
          provider?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total?: number
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_history: {
        Row: {
          created_at: string
          detail: string | null
          event_type: string
          id: string
          lead_id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event_type: string
          id?: string
          lead_id: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          attributes: Json
          booking_url: string | null
          business_type: string | null
          category: string | null
          city: string | null
          company_name: string
          contact_page_url: string | null
          country: string | null
          created_at: string
          created_by: string
          description: string | null
          discovered_at: string
          domain: string | null
          email: string | null
          email_status: Database["public"]["Enums"]["email_status"]
          email_verification_confidence: number | null
          email_verification_provider: string | null
          email_verification_reason: string | null
          email_verified_at: string | null
          has_ecommerce: boolean | null
          id: string
          location_count: number | null
          normalized_city: string | null
          normalized_domain: string | null
          normalized_email: string | null
          normalized_name: string
          normalized_phone: string | null
          opening_status: string | null
          ordering_url: string | null
          phone: string | null
          postal_code: string | null
          rating: number | null
          region: string | null
          review_count: number | null
          search_query: string | null
          social_urls: Json
          source: string
          source_url: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          attributes?: Json
          booking_url?: string | null
          business_type?: string | null
          category?: string | null
          city?: string | null
          company_name: string
          contact_page_url?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          discovered_at?: string
          domain?: string | null
          email?: string | null
          email_status?: Database["public"]["Enums"]["email_status"]
          email_verification_confidence?: number | null
          email_verification_provider?: string | null
          email_verification_reason?: string | null
          email_verified_at?: string | null
          has_ecommerce?: boolean | null
          id?: string
          location_count?: number | null
          normalized_city?: string | null
          normalized_domain?: string | null
          normalized_email?: string | null
          normalized_name: string
          normalized_phone?: string | null
          opening_status?: string | null
          ordering_url?: string | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          region?: string | null
          review_count?: number | null
          search_query?: string | null
          social_urls?: Json
          source?: string
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          attributes?: Json
          booking_url?: string | null
          business_type?: string | null
          category?: string | null
          city?: string | null
          company_name?: string
          contact_page_url?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          discovered_at?: string
          domain?: string | null
          email?: string | null
          email_status?: Database["public"]["Enums"]["email_status"]
          email_verification_confidence?: number | null
          email_verification_provider?: string | null
          email_verification_reason?: string | null
          email_verified_at?: string | null
          has_ecommerce?: boolean | null
          id?: string
          location_count?: number | null
          normalized_city?: string | null
          normalized_domain?: string | null
          normalized_email?: string | null
          normalized_name?: string
          normalized_phone?: string | null
          opening_status?: string | null
          ordering_url?: string | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          region?: string | null
          review_count?: number | null
          search_query?: string | null
          social_urls?: Json
          source?: string
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_usage: {
        Row: {
          created_at: string
          error: string | null
          estimated_cost: number | null
          id: string
          job_id: string | null
          kind: string
          metadata: Json
          operation: string
          provider: string
          requested_units: number | null
          success: boolean
          units: number
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          job_id?: string | null
          kind: string
          metadata?: Json
          operation: string
          provider: string
          requested_units?: number | null
          success: boolean
          units?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          job_id?: string | null
          kind?: string
          metadata?: Json
          operation?: string
          provider?: string
          requested_units?: number | null
          success?: boolean
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_usage_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member"
      email_status:
        | "valid"
        | "invalid"
        | "risky"
        | "unknown"
        | "pending"
        | "unverified"
        | "catch_all"
        | "disposable"
        | "role"
        | "not_checked"
      job_status: "queued" | "running" | "completed" | "failed" | "cancelled"
      job_type: "discovery" | "verification" | "import"
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
      app_role: ["admin", "member"],
      email_status: [
        "valid",
        "invalid",
        "risky",
        "unknown",
        "pending",
        "unverified",
        "catch_all",
        "disposable",
        "role",
        "not_checked",
      ],
      job_status: ["queued", "running", "completed", "failed", "cancelled"],
      job_type: ["discovery", "verification", "import"],
    },
  },
} as const
