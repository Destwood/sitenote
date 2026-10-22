export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      comments: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          mentions: string[];
          thread_id: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          mentions?: string[];
          thread_id: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          mentions?: string[];
          thread_id?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "comments_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      integrations: {
        Row: {
          created_at: string;
          id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          secret_id: string | null;
          settings: NonNullable<Json>;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          secret_id?: string | null;
          settings?: NonNullable<Json>;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          provider?: Database["public"]["Enums"]["integration_provider"];
          secret_id?: string | null;
          settings?: NonNullable<Json>;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          comment_id: string;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string | null;
          thread_id: string;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          comment_id: string;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          thread_id: string;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          thread_id?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          email: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          email?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sites: {
        Row: {
          created_at: string;
          id: string;
          origin: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          origin: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          origin?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      threads: {
        Row: {
          anchor: NonNullable<Json>;
          clickup_task_id: string | null;
          clickup_task_url: string | null;
          context: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          id: string;
          page_url: string;
          resolved_at: string | null;
          resolved_by: string | null;
          screenshot_path: string | null;
          site_id: string;
          status: Database["public"]["Enums"]["thread_status"];
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          anchor: NonNullable<Json>;
          clickup_task_id?: string | null;
          clickup_task_url?: string | null;
          context?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          page_url: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          screenshot_path?: string | null;
          site_id: string;
          status?: Database["public"]["Enums"]["thread_status"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          anchor?: NonNullable<Json>;
          clickup_task_id?: string | null;
          clickup_task_url?: string | null;
          context?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          page_url?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          screenshot_path?: string | null;
          site_id?: string;
          status?: Database["public"]["Enums"]["thread_status"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "threads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "threads_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "threads_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "threads_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: {
        Args: { p_display_name?: string; p_token: string };
        Returns: {
          role: Database["public"]["Enums"]["member_role"];
          workspace_id: string;
        }[];
      };
      create_invite: {
        Args: {
          p_expires_in?: string;
          p_role: Database["public"]["Enums"]["member_role"];
          p_workspace_id: string;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token: string;
          updated_at: string;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "invites";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_thread: {
        Args: {
          p_anchor: Json;
          p_body: string;
          p_context: Json;
          p_id?: string;
          p_mentions: string[];
          p_page_url: string;
          p_screenshot_path?: string;
          p_site_id: string;
        };
        Returns: {
          anchor: NonNullable<Json>;
          clickup_task_id: string | null;
          clickup_task_url: string | null;
          context: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          id: string;
          page_url: string;
          resolved_at: string | null;
          resolved_by: string | null;
          screenshot_path: string | null;
          site_id: string;
          status: Database["public"]["Enums"]["thread_status"];
          updated_at: string;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "threads";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      invite_preview: {
        Args: { p_token: string };
        Returns: {
          expires_at: string;
          role: Database["public"]["Enums"]["member_role"];
          valid: boolean;
          workspace_name: string;
        }[];
      };
    };
    Enums: {
      integration_provider: "clickup";
      member_role: "owner" | "member" | "guest";
      notification_kind: "reply" | "mention";
      thread_status: "open" | "resolved";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      integration_provider: ["clickup"],
      member_role: ["owner", "member", "guest"],
      notification_kind: ["reply", "mention"],
      thread_status: ["open", "resolved"],
    },
  },
} as const;
