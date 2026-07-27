// src/supabase/supabase.types.ts
// Basato su database.types.ts ma con aggiunte per i service

export interface Manga {
  id: number;
  titolo: string;
  immagine: string | null;
  artista_id: number | null;
  numero_pagine: number | null;
  up_votes: number;
  down_votes: number;
  created_at: string;
  visible?: boolean;
  lingua?: string | null;
  url_origine?: string | null;
  pagine?: any[];
  categoria_id?: number | null;
}

export interface Artista {
  id: number;
  nome: string;
  counter?: number;
}

export interface Tag {
  id: number;
  nome: string;
  counter?: number;
}

export interface Categoria {
  id: number;
  nome: string;
  counter?: number;
}

export interface Gruppo {
  id: number;
  nome: string;
  counter?: number;
}

export interface Character {
  id: number;
  nome: string;
  counter?: number;
}

export interface Parody {
  id: number;
  nome: string;
  counter?: number;
}

export interface Vote {
  id: number;
  user_wallet: string;
  manga_id: number;
  vote_type: 'up' | 'down';
  created_at: string;
  updated_at: string;
}

export interface Bookmark {
  id: number;
  user_wallet: string;
  manga_id: number;
  last_page: number;
  status: 'reading' | 'completed' | 'dropped' | 'plan_to_read';
  added_at: string;
  updated_at: string;
  manga?: Manga;
}

export interface Comment {
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
}

export interface AnalyticsEvent {
  id: number;
  manga_id: number | null;
  event_type: string;
  wallet_address: string | null;
  user_agent: string | null;
  path: string | null;
  created_at: string;
}

export interface DailyStat {
  id?: number;
  date: string;
  total_visits: number;
  total_clicks: number;
  unique_wallets?: number;
  updated_at?: string;
}

export interface ReadingSession {
  id: number;
  user_wallet: string;
  manga_id: number;
  start_time: string;
  end_time: string | null;
  last_page: number | null;
  device_type: string | null;
  pages_read?: number[] | null;
  completion_rate?: number | null;
  session_duration?: number | null;
  last_page_timestamp?: string | null;
}

export interface TopMangaView {
  manga_id: number;
  view_count: number;
  manga?: Manga;
}

export interface MangaWithRelations extends Manga {
  artisti: Artista | null;
  categorie: Categoria | null;
  tags?: Tag[];
  gruppi?: Gruppo[];
  characters?: Character[];
  parodies?: Parody[];
}

export interface MangaFilterOptions {
  visible?: boolean;
  artista_id?: number;
  categoria_id?: number;
  tag_id?: number;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'titolo' | 'created_at' | 'up_votes' | 'down_votes';
  orderDirection?: 'asc' | 'desc';
}

export interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
  warnings?: string[];
}

export interface UpdateResult {
  success: boolean;
  data?: any;
  error?: any;
}

export interface MangaStats {
  id: number;
  titolo: string;
  total_views: number;
  total_votes: number;
  up_votes: number;
  down_votes: number;
  total_bookmarks: number;
  total_comments: number;
  total_reading_sessions: number;
  avg_completion_rate: number;
  daily_stats?: {
    date: string;
    views: number;
    unique_readers: number;
    completions: number;
  }[];
}
