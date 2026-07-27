import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// ============================================
// INTERFACCE DI SUPPORTO
//=============================================

// Interfaccia per la risposta della homepage
export interface HomeMangaResponse {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string;
  numero_pagine: number | null;
  created_at: string;
  artisti: { nome: string } | null;
  tags: string[];
}

// Interfaccia per le statistiche rapide
export interface QuickStats {
  total_manga: number;
  total_artists: number;
  total_tags: number;
}

// Interfaccia per i dettagli di un manga
export interface MangaDetailResponse {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string;
  numero_pagine: number | null;
  created_at: string;
  url_origine: string | null;
  pagine: any[];
  visible: boolean;
  categoria_id: number | null;
  artista_id: number | null;
  artisti: { nome: string } | null;
  categorie: { nome: string } | null;
  tags: string[];
}

// Interfaccia per la risposta admin (con conteggio totale)
export interface AdminMangaResponse {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string | null;
  numero_pagine: number | null;
  created_at: string;
  url_origine: string | null;
  pagine: any[];
  visible: boolean | null;
  categoria_id: number | null;
  artista_id: number | null;
  up_votes: number | null;
  down_votes: number | null;
  artisti: { id: number; nome: string; counter?: number } | null;
  categorie: { id: number; nome: string; counter?: number } | null;
  tags?: { id: number; nome: string; counter?: number }[];
}

// Interfaccia per risposta con conteggio (AGGIORNATA)
export interface AdminMangaWithCountResponse {
  data: AdminMangaResponse[];
  total: number;
  publicCount: number;
  hiddenCount: number;
}

// Interfaccia per i dati di aggiornamento manga
interface MangaUpdateData {
  visible: boolean;
  updated_at: string;
}

// Interfacce interne per i dati raw da Supabase
interface RawArtist {
  id: number;
  nome: string;
  counter?: number;
}

interface RawCategory {
  id: number;
  nome: string;
  counter?: number;
}

interface RawTag {
  id: number;
  nome: string;
  counter?: number;
}

interface RawMangaTag {
  tags: RawTag;
}

interface RawHomeManga {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string | null;
  numero_pagine: number | null;
  created_at: string;
  artisti: RawArtist | null;
  manga_tags: RawMangaTag[];
}

interface RawAdminManga {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string | null;
  numero_pagine: number | null;
  created_at: string;
  url_origine: string | null;
  pagine: any[];
  visible: boolean | null;
  categoria_id: number | null;
  artista_id: number | null;
  up_votes: number | null;
  down_votes: number | null;
  artisti: RawArtist | null;
  categorie: RawCategory | null;
  manga_tags: RawMangaTag[];
}

interface RawMangaDetail {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string | null;
  numero_pagine: number | null;
  created_at: string;
  url_origine: string | null;
  pagine: any[];
  visible: boolean | null;
  categoria_id: number | null;
  artista_id: number | null;
  artisti: RawArtist | null;
  categorie: RawCategory | null;
  manga_tags: RawMangaTag[];
}

@Injectable()
export class MangaService {
  private readonly logger = new Logger(MangaService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Recupera tutti i manga per la homepage (versione leggera)
   */
  async getHomeManga(): Promise<HomeMangaResponse[]> {
    try {
      this.logger.log('📋 Recupero manga per homepage');

      const { data, error } = await this.supabaseService.supabase
        .from('manga')
        .select(
          `
          id,
          titolo,
          immagine,
          lingua,
          numero_pagine,
          created_at,
          artisti:artista_id (nome),
          manga_tags (
            tags:tag_id (nome)
          )
        `,
        )
        .eq('visible', true)
        .order('created_at', { ascending: false });

      if (error) {
        this.logger.error('Errore Supabase:', error);
        throw new Error('Errore database');
      }

      // Tipizza i dati raw
      const rawData = (data || []) as unknown as RawHomeManga[];

      // Trasforma i dati per avere tags come array di stringhe
      const mangaList: HomeMangaResponse[] = rawData.map((item) => ({
        id: item.id,
        titolo: item.titolo,
        immagine: item.immagine,
        lingua: item.lingua || 'Italiano',
        numero_pagine: item.numero_pagine,
        created_at: item.created_at,
        artisti: item.artisti || null,
        tags: (item.manga_tags || [])
          .map((mt: RawMangaTag) => mt.tags?.nome)
          .filter((nome): nome is string => Boolean(nome)),
      }));

      this.logger.log(`✅ Restituiti ${mangaList.length} manga per homepage`);
      return mangaList;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero manga homepage: ${errorMessage}`);
      throw new Error('Errore nel recupero dei manga');
    }
  }

  /**
   * Recupera statistiche rapide per la homepage
   */
  async getQuickStats(): Promise<QuickStats> {
    try {
      const [mangaRes, artistsRes, tagsRes] = await Promise.all([
        this.supabaseService.supabase
          .from('manga')
          .select('*', { count: 'exact', head: true })
          .eq('visible', true),
        this.supabaseService.supabase
          .from('artisti')
          .select('*', { count: 'exact', head: true }),
        this.supabaseService.supabase
          .from('tags')
          .select('*', { count: 'exact', head: true }),
      ]);

      return {
        total_manga: mangaRes.count || 0,
        total_artists: artistsRes.count || 0,
        total_tags: tagsRes.count || 0,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero quick stats: ${errorMessage}`);
      return {
        total_manga: 0,
        total_artists: 0,
        total_tags: 0,
      };
    }
  }

  /**
   * Recupera tutti i manga per admin (versione completa) - Metodo originale per compatibilità
   */
  async getAllForAdmin(): Promise<AdminMangaResponse[]> {
    try {
      const result = await this.getAllForAdminWithCount();
      return result.data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero manga admin: ${errorMessage}`);
      throw new Error('Errore nel recupero dei manga');
    }
  }

  /**
   * Recupera tutti i manga per admin con conteggio totale (SOLUZIONE 2 MIGLIORATA)
   * Ora restituisce anche i conteggi di public e hidden assets
   */
  async getAllForAdminWithCount(): Promise<AdminMangaWithCountResponse> {
    try {
      this.logger.log('📋 Recupero manga per admin con conteggio dettagliato');

      // PASSO 1: Ottieni il conteggio totale
      const { count: totalCount, error: totalError } =
        await this.supabaseService.supabase
          .from('manga')
          .select('*', { count: 'exact', head: true });

      if (totalError) {
        this.logger.error('Errore conteggio totale:', totalError);
        throw new Error('Errore database nel conteggio totale');
      }

      // PASSO 2: Ottieni il conteggio dei manga pubblici (visible = true)
      const { count: publicCount, error: publicError } =
        await this.supabaseService.supabase
          .from('manga')
          .select('*', { count: 'exact', head: true })
          .eq('visible', true);

      if (publicError) {
        this.logger.error('Errore conteggio public:', publicError);
        throw new Error('Errore database nel conteggio public');
      }

      // PASSO 3: Ottieni il conteggio dei manga nascosti (visible = false)
      const { count: hiddenCount, error: hiddenError } =
        await this.supabaseService.supabase
          .from('manga')
          .select('*', { count: 'exact', head: true })
          .eq('visible', false);

      if (hiddenError) {
        this.logger.error('Errore conteggio hidden:', hiddenError);
        throw new Error('Errore database nel conteggio hidden');
      }

      this.logger.log(
        `📊 Totale manga nel database: ${totalCount} (Public: ${publicCount}, Hidden: ${hiddenCount})`,
      );

      // PASSO 4: Ottieni i dati con un limite alto (es. 10000)
      const { data, error } = await this.supabaseService.supabase
        .from('manga')
        .select(
          `
          *,
          artisti:artista_id (*),
          categorie:categoria_id (*),
          manga_tags (
            tags:tag_id (*)
          )
        `,
        )
        .order('id', { ascending: false })
        .limit(10000); // Limite alto per prendere tutti i manga

      if (error) {
        this.logger.error('Errore Supabase:', error);
        throw new Error('Errore database nel recupero dati');
      }

      // Tipizza i dati raw
      const rawData = (data || []) as unknown as RawAdminManga[];

      // Trasforma i dati
      const mangaList: AdminMangaResponse[] = rawData.map((item) => ({
        id: item.id,
        titolo: item.titolo,
        immagine: item.immagine,
        lingua: item.lingua,
        numero_pagine: item.numero_pagine,
        created_at: item.created_at,
        url_origine: item.url_origine,
        pagine: item.pagine || [],
        visible: item.visible,
        categoria_id: item.categoria_id,
        artista_id: item.artista_id,
        up_votes: item.up_votes || 0,
        down_votes: item.down_votes || 0,
        artisti: item.artisti || null,
        categorie: item.categorie || null,
        tags: (item.manga_tags || [])
          .map((mt: RawMangaTag) => mt.tags)
          .filter((tag): tag is RawTag => Boolean(tag)),
      }));

      this.logger.log(
        `✅ Restituiti ${mangaList.length} di ${totalCount} manga totali per admin`,
      );

      return {
        data: mangaList,
        total: totalCount || 0,
        publicCount: publicCount || 0,
        hiddenCount: hiddenCount || 0,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero manga admin: ${errorMessage}`);
      throw new Error('Errore nel recupero dei manga');
    }
  }

  /**
   * Recupera dettagli di un manga specifico
   */
  async getMangaById(id: number): Promise<MangaDetailResponse | null> {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('manga')
        .select(
          `
          *,
          artisti:artista_id (*),
          categorie:categoria_id (*),
          manga_tags (
            tags:tag_id (*)
          )
        `,
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        this.logger.error(`Errore recupero manga ${id}:`, error);
        return null;
      }

      // Tipizza il dato raw
      const rawData = data as unknown as RawMangaDetail;

      return {
        id: rawData.id,
        titolo: rawData.titolo,
        immagine: rawData.immagine,
        lingua: rawData.lingua || 'Italiano',
        numero_pagine: rawData.numero_pagine,
        created_at: rawData.created_at,
        url_origine: rawData.url_origine || null,
        pagine: rawData.pagine || [],
        visible: rawData.visible !== false,
        categoria_id: rawData.categoria_id || null,
        artista_id: rawData.artista_id || null,
        artisti: rawData.artisti ? { nome: rawData.artisti.nome } : null,
        categorie: rawData.categorie ? { nome: rawData.categorie.nome } : null,
        tags: (rawData.manga_tags || [])
          .map((mt: RawMangaTag) => mt.tags?.nome)
          .filter((nome): nome is string => Boolean(nome)),
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore recupero manga ${id}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Aggiorna visibilità di un manga
   */
  async updateVisibility(id: number, visible: boolean): Promise<boolean> {
    try {
      const updateData = {
        visible,
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.supabaseService.supabase
        .from('manga')
        .update(updateData as never)
        .eq('id', id);

      if (error) {
        this.logger.error(
          `Errore aggiornamento visibilità manga ${id}:`,
          error,
        );
        return false;
      }

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(
        `Errore aggiornamento visibilità manga ${id}: ${errorMessage}`,
      );
      return false;
    }
  }

  /**
   * Elimina un manga
   */
  async deleteManga(id: number): Promise<boolean> {
    try {
      const { error } = await this.supabaseService.supabase
        .from('manga')
        .delete()
        .eq('id', id);

      if (error) {
        this.logger.error(`Errore eliminazione manga ${id}:`, error);
        return false;
      }

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Errore eliminazione manga ${id}: ${errorMessage}`);
      return false;
    }
  }
}
