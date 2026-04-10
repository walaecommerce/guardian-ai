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
      compliance_reports: {
        Row: {
          amazon_url: string | null
          average_score: number | null
          created_at: string
          failed_count: number
          fixed_images_count: number
          id: string
          listing_title: string | null
          passed_count: number
          product_asin: string | null
          report_data: Json
          total_images: number
          user_id: string | null
        }
        Insert: {
          amazon_url?: string | null
          average_score?: number | null
          created_at?: string
          failed_count?: number
          fixed_images_count?: number
          id?: string
          listing_title?: string | null
          passed_count?: number
          product_asin?: string | null
          report_data?: Json
          total_images?: number
          user_id?: string | null
        }
        Update: {
          amazon_url?: string | null
          average_score?: number | null
          created_at?: string
          failed_count?: number
          fixed_images_count?: number
          id?: string
          listing_title?: string | null
          passed_count?: number
          product_asin?: string | null
          report_data?: Json
          total_images?: number
          user_id?: string | null
        }
        Relationships: []
      }
      credit_usage_log: {
        Row: {
          consumed_at: string
          credit_type: string
          edge_function: string | null
          id: string
          user_id: string
        }
        Insert: {
          consumed_at?: string
          credit_type: string
          edge_function?: string | null
          id?: string
          user_id: string
        }
        Update: {
          consumed_at?: string
          credit_type?: string
          edge_function?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      enhancement_sessions: {
        Row: {
          amazon_url: string | null
          average_score: number | null
          created_at: string
          failed_count: number
          fixed_count: number
          id: string
          listing_title: string | null
          passed_count: number
          product_asin: string | null
          product_identity: Json | null
          status: string
          total_images: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amazon_url?: string | null
          average_score?: number | null
          created_at?: string
          failed_count?: number
          fixed_count?: number
          id?: string
          listing_title?: string | null
          passed_count?: number
          product_asin?: string | null
          product_identity?: Json | null
          status?: string
          total_images?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amazon_url?: string | null
          average_score?: number | null
          created_at?: string
          failed_count?: number
          fixed_count?: number
          id?: string
          listing_title?: string | null
          passed_count?: number
          product_asin?: string | null
          product_identity?: Json | null
          status?: string
          total_images?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_claim_cache: {
        Row: {
          claim_key: string
          claim_text: string
          created_at: string
          details: string | null
          exists: boolean
          expires_at: string
          id: string
          release_status: string
          sources: Json | null
          verified: boolean
        }
        Insert: {
          claim_key: string
          claim_text: string
          created_at?: string
          details?: string | null
          exists?: boolean
          expires_at?: string
          id?: string
          release_status?: string
          sources?: Json | null
          verified?: boolean
        }
        Update: {
          claim_key?: string
          claim_text?: string
          created_at?: string
          details?: string | null
          exists?: boolean
          expires_at?: string
          id?: string
          release_status?: string
          sources?: Json | null
          verified?: boolean
        }
        Relationships: []
      }
      session_images: {
        Row: {
          analysis_result: Json | null
          created_at: string
          fix_attempts: Json | null
          fixed_image_url: string | null
          id: string
          image_category: string | null
          image_name: string
          image_type: string
          original_image_url: string
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          analysis_result?: Json | null
          created_at?: string
          fix_attempts?: Json | null
          fixed_image_url?: string | null
          id?: string
          image_category?: string | null
          image_name: string
          image_type: string
          original_image_url: string
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          analysis_result?: Json | null
          created_at?: string
          fix_attempts?: Json | null
          fixed_image_url?: string | null
          id?: string
          image_category?: string | null
          image_name?: string
          image_type?: string
          original_image_url?: string
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_images_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "enhancement_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          created_at: string
          credit_type: Database["public"]["Enums"]["credit_type"]
          id: string
          plan: string
          total_credits: number
          updated_at: string
          used_credits: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_type: Database["public"]["Enums"]["credit_type"]
          id?: string
          plan?: string
          total_credits?: number
          updated_at?: string
          used_credits?: number
          user_id: string
        }
        Update: {
          created_at?: string
          credit_type?: Database["public"]["Enums"]["credit_type"]
          id?: string
          plan?: string
          total_credits?: number
          updated_at?: string
          used_credits?: number
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          amazon_store_url: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_complete: boolean
          updated_at: string
        }
        Insert: {
          amazon_store_url?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_complete?: boolean
          updated_at?: string
        }
        Update: {
          amazon_store_url?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_complete?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      app_role: "admin" | "user"
      credit_type: "scrape" | "analyze" | "fix"
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
      app_role: ["admin", "user"],
      credit_type: ["scrape", "analyze", "fix"],
    },
  },
} as const
