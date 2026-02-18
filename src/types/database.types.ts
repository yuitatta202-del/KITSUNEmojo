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
        };
        Insert: {
          id?: never;
          created_at?: string;
          event_type: string;
          manga_id?: number | null;
          wallet_address?: string | null;
          user_agent?: string | null;
          path?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['analytics_events']['Insert']
        >;
      };

      artisti: {
        Row: {
          id: number;
          nome: string;
          counter: number | null;
        };
        Insert: {
          id?: never;
          nome: string;
          counter?: number | null;
        };
        Update: Partial<Database['public']['Tables']['artisti']['Insert']>;
      };
      
      categorie: {
        Row: {
          id: number;
          nome: string;
          counter: number | null;
        };
        Insert: {
          id?: never;
          nome: string;
          counter?: number | null;
        };
        Update: Partial<Database['public']['Tables']['categorie']['Insert']>;
      };
      
      characters: {
        Row: {
          id: number;
          nome: string;
          counter: number | null;
        };
        Insert: {
          id?: never;
          nome: string;
          counter?: number | null;
        };
        Update: Partial<Database['public']['Tables']['characters']['Insert']>;
      };
      
      daily_stats: {
        Row: {
          id: number;
          date: string;
          total_visits: number | null;
          total_clicks: number | null;
          unique_wallets: number | null;
        };
        Insert: {
          id?: never;
          date?: string;
          total_visits?: number | null;
          total_clicks?: number | null;
          unique_wallets?: number | null;
        };
        Update: Partial<Database['public']['Tables']['daily_stats']['Insert']>;
      };
      
      gruppi: {
        Row: {
          id: number;
          nome: string;
          counter: number | null;
        };
        Insert: {
          id?: never;
          nome: string;
          counter?: number | null;
        };
        Update: Partial<Database['public']['Tables']['gruppi']['Insert']>;
      };
      
      manga: {
        Row: {
          id: number;
          titolo: string;
          immagine: string | null;
          lingua: string | null;
          numero_pagine: number | null;
          created_at: string;
          url_origine: string | null;
          pagine: string[];
          visible: boolean | null;
          categoria_id: number | null;
          artista_id: number | null;
        };
        Insert: {
          id?: never;
          titolo: string;
          immagine?: string | null;
          lingua?: string | null;
          numero_pagine?: number | null;
          created_at?: string;
          url_origine?: string | null;
          pagine?: string[];
          visible?: boolean | null;
          categoria_id?: number | null;
          artista_id?: number | null;
        };
        Update: Partial<Database['public']['Tables']['manga']['Insert']>;
      };
      
      manga_characters: {
        Row: {
          manga_id: number;
          character_id: number;
        };
        Insert: {
          manga_id: number;
          character_id: number;
        };
        Update: Partial<Database['public']['Tables']['manga_characters']['Insert']>;
      };
      
      manga_gruppi: {
        Row: {
          manga_id: number;
          gruppo_id: number;
        };
        Insert: {
          manga_id: number;
          gruppo_id: number;
        };
        Update: Partial<Database['public']['Tables']['manga_gruppi']['Insert']>;
      };
      
      manga_parodies: {
        Row: {
          manga_id: number;
          parody_id: number;
        };
        Insert: {
          manga_id: number;
          parody_id: number;
        };
        Update: Partial<Database['public']['Tables']['manga_parodies']['Insert']>;
      };
      
      manga_tags: {
        Row: {
          manga_id: number;
          tag_id: number;
        };
        Insert: {
          manga_id: number;
          tag_id: number;
        };
        Update: Partial<Database['public']['Tables']['manga_tags']['Insert']>;
      };
      
      parodies: {
        Row: {
          id: number;
          nome: string;
          counter: number | null;
        };
        Insert: {
          id?: never;
          nome: string;
          counter?: number | null;
        };
        Update: Partial<Database['public']['Tables']['parodies']['Insert']>;
      };
      
      tags: {
        Row: {
          id: number;
          nome: string;
          counter: number | null;
        };
        Insert: {
          id?: never;
          nome: string;
          counter?: number | null;
        };
        Update: Partial<Database['public']['Tables']['tags']['Insert']>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Tipi di utilità per le relazioni
export type MangaWithRelations = Database['public']['Tables']['manga']['Row'] & {
  artisti: Database['public']['Tables']['artisti']['Row'] | null;
  categorie: Database['public']['Tables']['categorie']['Row'] | null;
  tags?: Database['public']['Tables']['tags']['Row'][];
  characters?: Database['public']['Tables']['characters']['Row'][];
  parodies?: Database['public']['Tables']['parodies']['Row'][];
  gruppi?: Database['public']['Tables']['gruppi']['Row'][];
};

export type Artista = Database['public']['Tables']['artisti']['Row'];
export type Categoria = Database['public']['Tables']['categorie']['Row'];
export type Tag = Database['public']['Tables']['tags']['Row'];
export type Character = Database['public']['Tables']['characters']['Row'];
export type Parody = Database['public']['Tables']['parodies']['Row'];
export type Gruppo = Database['public']['Tables']['gruppi']['Row'];
export type AdminUser = Database['public']['Tables']['admin_users']['Row'];
export type AnalyticsEvent = Database['public']['Tables']['analytics_events']['Row'];
export type DailyStat = Database['public']['Tables']['daily_stats']['Row'];