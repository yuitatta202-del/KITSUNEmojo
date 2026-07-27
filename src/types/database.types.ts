export interface Database {
  public: {
    Tables: {
      admin_users: {
        Row: {
          id: number;
          wallet_address: string;
          username: string | null;
          ultimo_accesso: string | null;
        };
        Insert: {
          id?: never;
          wallet_address: string;
          username?: string | null;
          ultimo_accesso?: string | null;
        };
        Update: Partial<Database['public']['Tables']['admin_users']['Insert']>;
      };

      analytics_events: {
        Row: {
          id: number;
          created_at: string;
          event_type: string;
          manga_id: number | null;
          wallet_address: string | null;
          user_agent: string | null;
          path: string | null;
          session_id: string | null;
          referrer: string | null;
          device_info: any;
        };
        Insert: {
          id?: never;
          created_at?: string;
          event_type: string;
          manga_id?: number | null;
          wallet_address?: string | null;
          user_agent?: string | null;
          path?: string | null;
          session_id?: string | null;
          referrer?: string | null;
          device_info?: any;
        };
        Update: Partial<
          Database['public']['Tables']['analytics_events']['Insert']
        >;
      };

      artisti: {
        Row: { id: number; nome: string; counter: number };
        Insert: { id?: number; nome: string; counter?: number };
        Update: Partial<Database['public']['Tables']['artisti']['Insert']>;
      };

      bookmarks: {
        Row: {
          id: number;
          user_wallet: string;
          manga_id: number;
          last_page: number;
          status: string;
          added_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          user_wallet: string;
          manga_id: number;
          last_page?: number;
          status?: string;
          added_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bookmarks']['Insert']>;
      };

      categorie: {
        Row: { id: number; nome: string; counter: number };
        Insert: { id?: number; nome: string; counter?: number };
        Update: Partial<Database['public']['Tables']['categorie']['Insert']>;
      };

      characters: {
        Row: { id: number; nome: string; counter: number };
        Insert: { id?: number; nome: string; counter?: number };
        Update: Partial<Database['public']['Tables']['characters']['Insert']>;
      };

      comments: {
        Row: {
          id: number;
          manga_id: number;
          user_wallet: string;
          content: string;
          parent_id: number | null;
          created_at: string;
          updated_at: string;
          is_edited: boolean;
          is_deleted: boolean;
          up_votes: number;
          down_votes: number;
        };
        Insert: {
          id?: never;
          manga_id: number;
          user_wallet: string;
          content: string;
          parent_id?: number | null;
          created_at?: string;
          updated_at?: string;
          is_edited?: boolean;
          is_deleted?: boolean;
          up_votes?: number;
          down_votes?: number;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
      };

      comment_mentions: {
        Row: {
          id: number;
          comment_id: number;
          mentioned_manga_id: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          comment_id: number;
          mentioned_manga_id: number;
          created_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['comment_mentions']['Insert']
        >;
      };

      comment_votes: {
        Row: {
          id: number;
          comment_id: number;
          user_wallet: string;
          vote_type: 'up' | 'down';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          comment_id: number;
          user_wallet: string;
          vote_type: 'up' | 'down';
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['comment_votes']['Insert']
        >;
      };

      daily_stats: {
        Row: {
          id: number;
          date: string;
          total_visits: number;
          total_clicks: number;
          unique_wallets: number;
        };
        Insert: {
          id?: never;
          date?: string;
          total_visits?: number;
          total_clicks?: number;
          unique_wallets?: number;
        };
        Update: Partial<Database['public']['Tables']['daily_stats']['Insert']>;
      };

      gruppi: {
        Row: { id: number; nome: string; counter: number };
        Insert: { id?: number; nome: string; counter?: number };
        Update: Partial<Database['public']['Tables']['gruppi']['Insert']>;
      };

      manga: {
        Row: {
          id: number;
          titolo: string;
          immagine: string | null;
          lingua: string;
          numero_pagine: number | null;
          created_at: string;
          url_origine: string | null;
          pagine: any;
          visible: boolean;
          categoria_id: number | null;
          artista_id: number | null;
          up_votes: number;
          down_votes: number;
        };
        Insert: {
          id?: never;
          titolo: string;
          immagine?: string | null;
          lingua?: string;
          numero_pagine?: number | null;
          created_at?: string;
          url_origine?: string | null;
          pagine?: any;
          visible?: boolean;
          categoria_id?: number | null;
          artista_id?: number | null;
          up_votes?: number;
          down_votes?: number;
        };
        Update: Partial<Database['public']['Tables']['manga']['Insert']>;
      };

      manga_daily_stats: {
        Row: {
          id: number;
          manga_id: number;
          date: string;
          views: number;
          unique_readers: number;
          avg_session_duration: number | null;
          up_votes: number;
          down_votes: number;
          completions: number;
        };
        Insert: {
          id?: never;
          manga_id: number;
          date?: string;
          views?: number;
          unique_readers?: number;
          avg_session_duration?: number | null;
          up_votes?: number;
          down_votes?: number;
          completions?: number;
        };
        Update: Partial<
          Database['public']['Tables']['manga_daily_stats']['Insert']
        >;
      };

      manga_characters: {
        Row: { manga_id: number; character_id: number };
        Insert: { manga_id: number; character_id: number };
        Update: any;
      };
      manga_gruppi: {
        Row: { manga_id: number; gruppo_id: number };
        Insert: { manga_id: number; gruppo_id: number };
        Update: any;
      };
      manga_parodies: {
        Row: { manga_id: number; parody_id: number };
        Insert: { manga_id: number; parody_id: number };
        Update: any;
      };
      manga_tags: {
        Row: { manga_id: number; tag_id: number };
        Insert: { manga_id: number; tag_id: number };
        Update: any;
      };

      parodies: {
        Row: { id: number; nome: string; counter: number };
        Insert: { id?: number; nome: string; counter?: number };
        Update: Partial<Database['public']['Tables']['parodies']['Insert']>;
      };

      reading_sessions: {
        Row: {
          id: number;
          user_wallet: string;
          manga_id: number;
          start_time: string;
          end_time: string | null;
          pages_read: number[];
          completion_rate: number | null;
          device_type: string | null;
          session_duration: number | null;
        };
        Insert: {
          id?: never;
          user_wallet: string;
          manga_id: number;
          start_time?: string;
          end_time?: string | null;
          pages_read?: number[];
          completion_rate?: number | null;
          device_type?: string | null;
          session_duration?: number | null;
        };
        Update: Partial<
          Database['public']['Tables']['reading_sessions']['Insert']
        >;
      };

      tags: {
        Row: { id: number; nome: string; counter: number };
        Insert: { id?: never; nome: string; counter?: number };
        Update: Partial<Database['public']['Tables']['tags']['Insert']>;
      };

      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          google_id: string | null;
          provider: string;
          role: string;
          created_at: string;
          updated_at: string;
          last_login: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          google_id?: string | null;
          provider?: string;
          role?: string;
          created_at?: string;
          updated_at?: string;
          last_login?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };

      votes: {
        Row: {
          id: number;
          user_wallet: string;
          manga_id: number;
          vote_type: 'up' | 'down';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          user_wallet: string;
          manga_id: number;
          vote_type: 'up' | 'down';
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['votes']['Insert']>;
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
  };
}
