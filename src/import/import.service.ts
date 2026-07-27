import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  Artista,
  Categoria,
  Tag,
  Parody,
  Character,
  Gruppo,
  Manga,
} from '../supabase/supabase.types';

// ============================================
// ENUM E COSTANTI
// ============================================

const HENTAIFOX_BASE_URL = 'https://hentaifox.com';
const HENTAIFOX_IMAGE_TEMPLATE =
  'https://{server}.hentaifox.com/images/{galleryId}/{page}.jpg';

const SERVER_VARIANTS = ['i3', 'i7', 'i1', 'i2', 't', 't3', 'i5', 'i', 'i8'];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// ============================================
// INTERFACCE LOCALI
// ============================================

export interface GalleryInfo {
  title: string;
  pages: number;
  images: string[];
  artist?: string;
  category?: string;
  tags?: string[];
  parodies?: string[];
  characters?: string[];
  groups?: string[];
}

export interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
  warnings?: string[];
}

export interface BulkImportResult {
  success: boolean;
  processed: number;
  successful: number;
  failed: number;
  details: Array<ImportResult & { url: string }>;
}

// ============================================
// SERVICE PRINCIPALE
// ============================================

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Estrae informazioni da una gallery Hentaifox con retry
   */
  async extractGalleryInfo(galleryId: string): Promise<GalleryInfo | null> {
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      try {
        this.logger.log(
          `🔍 Estrazione metadati per gallery ${galleryId} (tentativo ${attempts + 1}/${MAX_RETRIES})`,
        );

        const response = await axios.get<string>(
          `${HENTAIFOX_BASE_URL}/gallery/${galleryId}/`,
          {
            headers: { 'User-Agent': USER_AGENT },
            timeout: TIMEOUT,
          },
        );

        const html = response.data;

        // Estrai titolo
        const title = this.extractTitle(html, galleryId);

        // Estrai numero pagine
        const pages = this.extractPageCount(html);

        // Estrai artista
        const artist = this.extractArtist(html);

        // Estrai categoria
        const category = this.extractCategory(html);

        // Estrai tags, parodies, characters, groups
        const tags = this.extractTags(html);
        const parodies = this.extractParodies(html);
        const characters = this.extractCharacters(html);
        const groups = this.extractGroups(html);

        // Genera URL immagini
        const images = this.generateImageUrls(galleryId, pages);

        this.logger.log(`✅ Metadati estratti: ${title} (${pages} pagine)`);

        return {
          title,
          pages,
          images,
          artist,
          category,
          tags: tags.slice(0, 30),
          parodies: parodies.slice(0, 10),
          characters: characters.slice(0, 20),
          groups: groups.slice(0, 10),
        };
      } catch (err) {
        attempts++;

        if (attempts === MAX_RETRIES) {
          this.logger.error(
            `❌ Errore estrazione gallery ${galleryId} dopo ${MAX_RETRIES} tentativi:`,
            err,
          );
          return null;
        }

        this.logger.warn(
          `⚠️ Tentativo ${attempts} fallito, nuovo tentativo tra ${RETRY_DELAY}ms`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * attempts),
        );
      }
    }

    return null;
  }

  /**
   * Estrae titolo dall'HTML
   */
  private extractTitle(html: string, defaultId: string): string {
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    return titleMatch
      ? titleMatch[1].replace(' | HentaiFox', '').trim()
      : `Gallery ${defaultId}`;
  }

  /**
   * Estrae numero pagine dall'HTML
   */
  private extractPageCount(html: string): number {
    const pagesMatch =
      html.match(/(\d+)\s+pages/i) || html.match(/(\d+)\s+images/i);
    return pagesMatch ? parseInt(pagesMatch[1], 10) : 10;
  }

  /**
   * Estrae artista dall'HTML
   */
  private extractArtist(html: string): string | undefined {
    const artistMatch = html.match(/Artist:\s*([^<]+)/i);
    return artistMatch ? artistMatch[1].trim() : undefined;
  }

  /**
   * Estrae categoria dall'HTML
   */
  private extractCategory(html: string): string | undefined {
    const categoryMatch = html.match(/Category:\s*([^<]+)/i);
    return categoryMatch ? categoryMatch[1].trim() : undefined;
  }

  /**
   * Estrae tags dall'HTML
   */
  private extractTags(html: string): string[] {
    return this.extractItems(
      html,
      /<a[^>]*href="[^"]*\/tag\/[^"]*"[^>]*>([^<]+)<\/a>/gi,
    );
  }

  /**
   * Estrae parodies dall'HTML
   */
  private extractParodies(html: string): string[] {
    return this.extractItems(
      html,
      /<a[^>]*href="[^"]*\/parody\/[^"]*"[^>]*>([^<]+)<\/a>/gi,
    );
  }

  /**
   * Estrae characters dall'HTML
   */
  private extractCharacters(html: string): string[] {
    return this.extractItems(
      html,
      /<a[^>]*href="[^"]*\/character\/[^"]*"[^>]*>([^<]+)<\/a>/gi,
    );
  }

  /**
   * Estrae groups dall'HTML
   */
  private extractGroups(html: string): string[] {
    return this.extractItems(
      html,
      /<a[^>]*href="[^"]*\/group\/[^"]*"[^>]*>([^<]+)<\/a>/gi,
    );
  }

  /**
   * Utility per estrarre items con regex
   */
  private extractItems(html: string, regex: RegExp): string[] {
    const items: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null) {
      const item = match[1]?.trim();
      if (item && !items.includes(item)) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Genera URL immagini
   */
  private generateImageUrls(galleryId: string, pages: number): string[] {
    const baseServer = SERVER_VARIANTS[0];
    return Array.from({ length: pages }, (_, i) =>
      HENTAIFOX_IMAGE_TEMPLATE.replace('{server}', baseServer)
        .replace('{galleryId}', galleryId)
        .replace('{page}', (i + 1).toString()),
    );
  }

  /**
   * Trova o crea un artista
   */
  async findOrCreateArtist(name: string): Promise<number | null> {
    return this.findOrCreateEntity<Artista>('artisti', name);
  }

  /**
   * Trova o crea una categoria
   */
  async findOrCreateCategory(name: string): Promise<number | null> {
    return this.findOrCreateEntity<Categoria>('categorie', name);
  }

  /**
   * Trova o crea un tag
   */
  async findOrCreateTag(name: string): Promise<number | null> {
    return this.findOrCreateEntity<Tag>('tags', name);
  }

  /**
   * Trova o crea una parodia
   */
  async findOrCreateParody(name: string): Promise<number | null> {
    return this.findOrCreateEntity<Parody>('parodies', name);
  }

  /**
   * Trova o crea un personaggio
   */
  async findOrCreateCharacter(name: string): Promise<number | null> {
    return this.findOrCreateEntity<Character>('characters', name);
  }

  /**
   * Trova o crea un gruppo
   */
  async findOrCreateGroup(name: string): Promise<number | null> {
    return this.findOrCreateEntity<Gruppo>('gruppi', name);
  }

  /**
   * Utility generica per trovare o creare entità
   */
  private async findOrCreateEntity<T extends { id: number }>(
    table: string,
    name: string,
  ): Promise<number | null> {
    if (!name || name === 'Unknown') return null;

    try {
      const { data: existing } = await this.supabaseService.supabase
        .from(table)
        .select('id')
        .eq('nome', name)
        .maybeSingle();

      if (existing) {
        return (existing as T).id;
      }

      const { data: newItem, error } = await this.supabaseService.supabase
        .from(table)
        .insert({ nome: name } as never)
        .select()
        .single();

      if (error || !newItem) {
        this.logger.error(`Errore creazione ${table}: ${error?.message}`);
        return null;
      }

      return (newItem as T).id;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Errore findOrCreateEntity (${table}): ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Importa un manga da URL
   */
  async importFromUrl(url: string): Promise<ImportResult> {
    this.logger.log(`📥 Import da URL: ${url}`);

    try {
      // Estrai ID gallery
      const galleryId = this.extractGalleryId(url);
      if (!galleryId) {
        return {
          success: false,
          error:
            'URL non valido. Usa formato: https://hentaifox.com/gallery/ID/',
        };
      }

      this.logger.log(`📋 Gallery ID estratto: ${galleryId}`);

      // Estrai metadati
      const galleryInfo = await this.extractGalleryInfo(galleryId);
      if (!galleryInfo) {
        return {
          success: false,
          error: 'Impossibile estrarre metadati dalla gallery',
        };
      }

      // Verifica se già esiste
      const existingId = await this.findExistingManga(url);
      if (existingId) {
        return {
          success: false,
          error: 'Manga già importato',
          id: existingId,
        };
      }

      // Inserisci manga
      const mangaId = await this.insertManga(galleryInfo, url);
      if (!mangaId) {
        return {
          success: false,
          error: 'Errore inserimento manga nel database',
        };
      }

      const warnings: string[] = [];

      // Importa relazioni
      await Promise.all([
        this.importTags(mangaId, galleryInfo.tags, warnings),
        this.importParodies(mangaId, galleryInfo.parodies, warnings),
        this.importCharacters(mangaId, galleryInfo.characters, warnings),
        this.importGroups(mangaId, galleryInfo.groups, warnings),
      ]);

      this.logger.log(
        `✅ Manga importato: ${galleryInfo.title} (ID: ${mangaId})`,
      );

      return {
        success: true,
        title: galleryInfo.title,
        id: mangaId,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Errore import: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Estrae gallery ID dall'URL
   */
  private extractGalleryId(url: string): string | null {
    const match = url.match(/(?:gallery|g)\/(\d+)/i);
    return match ? match[1] : null;
  }

  /**
   * Verifica se manga già esiste
   */
  private async findExistingManga(url: string): Promise<number | null> {
    try {
      const { data } = await this.supabaseService.supabase
        .from('manga')
        .select('id')
        .eq('url_origine', url)
        .maybeSingle();

      return data ? (data as Manga).id : null;
    } catch {
      return null;
    }
  }

  /**
   * Inserisce manga nel database
   */
  private async insertManga(
    info: GalleryInfo,
    url: string,
  ): Promise<number | null> {
    const artistaId = info.artist
      ? await this.findOrCreateArtist(info.artist)
      : null;

    const categoriaId = info.category
      ? await this.findOrCreateCategory(info.category)
      : null;

    try {
      const { data: newManga, error } = await this.supabaseService.supabase
        .from('manga')
        .insert({
          titolo: info.title,
          url_origine: url,
          artista_id: artistaId,
          categoria_id: categoriaId,
          numero_pagine: info.pages,
          pagine: info.images,
          immagine: info.images[0] || null,
          created_at: new Date().toISOString(),
          visible: true,
        } as never)
        .select()
        .single();

      if (error || !newManga) {
        this.logger.error(`Errore inserimento manga: ${error?.message}`);
        return null;
      }

      return (newManga as Manga).id;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Errore inserimento manga: ${error.message}`);
      return null;
    }
  }

  /**
   * Importa tags
   */
  private async importTags(
    mangaId: number,
    tags: string[] = [],
    warnings: string[],
  ): Promise<void> {
    for (const tagName of tags) {
      const tagId = await this.findOrCreateTag(tagName);
      if (tagId) {
        await this.supabaseService.supabase
          .from('manga_tags')
          .insert({ manga_id: mangaId, tag_id: tagId } as never);
      } else {
        warnings.push(`Tag non importato: ${tagName}`);
      }
    }
  }

  /**
   * Importa parodies
   */
  private async importParodies(
    mangaId: number,
    parodies: string[] = [],
    warnings: string[],
  ): Promise<void> {
    for (const parodyName of parodies) {
      const parodyId = await this.findOrCreateParody(parodyName);
      if (parodyId) {
        await this.supabaseService.supabase
          .from('manga_parodies')
          .insert({ manga_id: mangaId, parody_id: parodyId } as never);
      } else {
        warnings.push(`Parodia non importata: ${parodyName}`);
      }
    }
  }

  /**
   * Importa characters
   */
  private async importCharacters(
    mangaId: number,
    characters: string[] = [],
    warnings: string[],
  ): Promise<void> {
    for (const characterName of characters) {
      const characterId = await this.findOrCreateCharacter(characterName);
      if (characterId) {
        await this.supabaseService.supabase
          .from('manga_characters')
          .insert({ manga_id: mangaId, character_id: characterId } as never);
      } else {
        warnings.push(`Personaggio non importato: ${characterName}`);
      }
    }
  }

  /**
   * Importa gruppi
   */
  private async importGroups(
    mangaId: number,
    groups: string[] = [],
    warnings: string[],
  ): Promise<void> {
    for (const groupName of groups) {
      const groupId = await this.findOrCreateGroup(groupName);
      if (groupId) {
        await this.supabaseService.supabase
          .from('manga_gruppi')
          .insert({ manga_id: mangaId, gruppo_id: groupId } as never);
      } else {
        warnings.push(`Gruppo non importato: ${groupName}`);
      }
    }
  }
}
