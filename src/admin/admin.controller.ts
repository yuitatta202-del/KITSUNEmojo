/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Get,
  Delete,
  Query,
  Res,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  Post,
  Body,
  Put,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import axios from 'axios';
import { verifyMessage } from 'ethers';
import { SupabaseService } from '../supabase/supabase.service';

// Definisci l'interfaccia localmente invece di importarla
interface MangaWithRelations {
  id: number;
  titolo: string;
  immagine: string | null;
  lingua: string;
  numero_pagine: number | null;
  created_at: string;
  url_origine: string | null;
  pagine: string[];
  visible: boolean;
  categoria_id: number | null;
  artista_id: number | null;
  artisti: { nome: string } | null;
  categorie: { nome: string } | null;
}

interface MangaRecord {
  id: number;
  immagine: string | null;
  titolo: string;
  visible?: boolean;
}

interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
}

interface BulkImportBody {
  urls: string[];
}

interface UpdateMangaBody {
  titolo?: string;
  visible?: boolean;
  artista_id?: number | null;
  categoria_id?: number | null;
  [key: string]: unknown;
}

interface StatsResponse {
  date: string;
  total_visits: number;
  total_clicks: number;
  unique_wallets: number;
}

// Interfacce per le nuove risposte
interface ArtistResponse {
  id: number;
  nome: string;
  counter: number;
}

interface TagResponse {
  id: number;
  nome: string;
  counter: number;
}

interface SystemStats {
  total_manga: number;
  total_artists: number;
  total_tags: number;
  recent_manga: number;
}

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private readonly AUTHORIZED_ADMINS = [
    '0x2aab3b9458cbb3709c6a131b1d9a7a0eb111efbc'.toLowerCase(),
  ];

  /**
   * Recupera tutti i manga per la home page (con tags trasformati)
   */
  @Get('manga')
  async getAllManga(): Promise<any[]> {
    try {
      // Usa il nuovo metodo che restituisce tags come array piatto
      const manga = await this.supabaseService.getAllMangaForHome();
      return manga;
    } catch (err) {
      this.logger.error('Errore getAllManga', err);
      throw new HttpException(
        'Errore recupero manga',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Importa un singolo manga da URL
   */
  @Post('import')
  async importManga(@Body('url') url: string): Promise<ImportResult> {
    if (!url) {
      throw new HttpException('URL mancante', HttpStatus.BAD_REQUEST);
    }
    return await this.supabaseService.autoImport(url);
  }

  /**
   * Import multiplo di manga
   */
  @Post('bulk')
  async bulkImport(@Body() body: BulkImportBody): Promise<{
    success: boolean;
    total: number;
    details: Array<ImportResult & { url: string }>;
  }> {
    if (!body.urls || !Array.isArray(body.urls)) {
      throw new HttpException('Lista URL non valida', HttpStatus.BAD_REQUEST);
    }

    const results: Array<ImportResult & { url: string }> = [];
    this.logger.log(`🚀 Avvio Bulk Import per ${body.urls.length} elementi`);

    for (const url of body.urls) {
      if (!url) continue;

      try {
        const res = await this.supabaseService.autoImport(url);
        results.push({ url, ...res });
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Errore sconosciuto';
        this.logger.error(`Fallimento su ${url}: ${errorMessage}`);
        results.push({ url, success: false, error: errorMessage });
      }

      // Pausa tra le richieste per evitare rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return { success: true, total: results.length, details: results };
  }

  /**
   * Aggiorna un manga esistente
   */
  @Put('manga/:id')
  async updateManga(
    @Param('id') id: string,
    @Body() updateData: UpdateMangaBody,
  ): Promise<{ success: boolean; id: number }> {
    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    try {
      const { error } = await this.supabaseService.supabase
        .from('manga')
        .update(updateData)
        .eq('id', mangaId);

      if (error) {
        throw error;
      }

      return { success: true, id: mangaId };
    } catch (err) {
      this.logger.error(`Errore aggiornamento manga ${id}`, err);
      throw new HttpException(
        'Errore aggiornamento manga',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Elimina un manga (richiede autenticazione)
   */
  @Delete('manga/:id')
  async deleteManga(
    @Param('id') id: string,
    @Headers('x-signature') signature: string,
    @Headers('x-message') message: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<{ success: boolean }> {
    // Validazione input
    if (!id || !signature || !message || !wallet) {
      throw new UnauthorizedException('Protocollo di sicurezza incompleto.');
    }

    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    try {
      // Verifica firma crittografica
      const recoveredAddress = verifyMessage(message, signature).toLowerCase();

      if (
        recoveredAddress !== wallet.toLowerCase() ||
        !this.AUTHORIZED_ADMINS.includes(recoveredAddress)
      ) {
        throw new UnauthorizedException('Accesso negato: Firma non valida.');
      }

      this.logger.warn(`[DELETE] Asset ${id} rimosso da: ${recoveredAddress}`);

      // Elimina il manga
      const { error } = await this.supabaseService.supabase
        .from('manga')
        .delete()
        .eq('id', mangaId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (err: unknown) {
      this.logger.error(
        `Errore cancellazione: ${err instanceof Error ? err.message : 'Sconosciuto'}`,
      );

      if (err instanceof UnauthorizedException) {
        throw err;
      }

      throw new HttpException(
        "Errore durante l'eliminazione",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Proxy per immagini (evita CORS)
   */
  @Get('proxy')
  async proxyImage(
    @Query('url') imageUrl: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!imageUrl) {
      res.status(HttpStatus.BAD_REQUEST).send('URL mancante');
      return;
    }

    const decodedUrl = decodeURIComponent(imageUrl);
    const cleanUrl = decodedUrl
      .replace(/(\.(jpg|jpeg|png|webp|avif)).*/i, '$1')
      .replace(/['"]/g, '');

    try {
      const response = await axios.get<Buffer>(cleanUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          Referer: 'https://hentaifox.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });

      res.set({
        'Content-Type': response.headers['content-type'] || 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*',
      });

      res.send(response.data);
    } catch {
      this.logger.error(`Proxy error per: ${cleanUrl}`);
      res.status(HttpStatus.NOT_FOUND).send('Immagine non trovata');
    }
  }

  /**
   * Avvia riparazione globale dei link delle immagini
   */
  @Post('maintenance/repair-all')
  async repairAllLinks(): Promise<{
    message: string;
    total: number;
  }> {
    try {
      const allManga = await this.supabaseService.getAllMangaAdmin();

      // Avvia in background
      this.runGlobalRepair(allManga).catch((err: Error) => {
        this.logger.error(`❌ Errore riparazione: ${err.message}`);
      });

      return {
        message: 'Procedura di riparazione avviata in background.',
        total: allManga.length,
      };
    } catch (err) {
      this.logger.error('Errore avvio riparazione', err);
      throw new HttpException(
        'Errore avvio procedura di riparazione',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Ottieni statistiche import
   */
  @Get('stats')
  async getStats(@Query('days') days?: string): Promise<StatsResponse[]> {
    try {
      const daysNumber = days ? parseInt(days, 10) : 30;
      return (await this.supabaseService.getImportStats(daysNumber)) as StatsResponse[];
    } catch (err) {
      this.logger.error('Errore recupero statistiche', err);
      throw new HttpException(
        'Errore recupero statistiche',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Pulisci cache metadata
   */
  @Post('maintenance/clear-cache')
  clearMetadataCache(): { success: boolean; message: string } {
    try {
      this.supabaseService.clearMetadataCache();
      return {
        success: true,
        message: 'Cache metadata pulita con successo',
      };
    } catch (err) {
      this.logger.error('Errore pulizia cache', err);
      throw new HttpException(
        'Errore pulizia cache',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // NUOVI ENDPOINT PER STATISTICHE E METADATA
  // ============================================================

  /**
   * Ottieni tutti gli artisti con conteggio
   */
  @Get('artists')
  async getAllArtists(): Promise<ArtistResponse[]> {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('artisti')
        .select('id, nome, counter')
        .order('nome');
      
      if (error) {
        this.logger.error('Errore recupero artisti:', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      this.logger.error('Errore recupero artisti', err);
      return [];
    }
  }

  /**
   * Ottieni tutti i tags con conteggio
   */
  @Get('tags')
  async getAllTags(): Promise<TagResponse[]> {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('tags')
        .select('id, nome, counter')
        .order('nome');
      
      if (error) {
        this.logger.error('Errore recupero tags:', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      this.logger.error('Errore recupero tags', err);
      return [];
    }
  }

  /**
   * Ottieni statistiche complete in una sola chiamata
   */
  @Get('system-stats')
  async getSystemStats(): Promise<SystemStats> {
    try {
      // Calcola data di 7 giorni fa
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const [mangaRes, artistsRes, tagsRes, recentRes] = await Promise.all([
        this.supabaseService.supabase.from('manga').select('*', { count: 'exact', head: true }),
        this.supabaseService.supabase.from('artisti').select('*', { count: 'exact', head: true }),
        this.supabaseService.supabase.from('tags').select('*', { count: 'exact', head: true }),
        this.supabaseService.supabase
          .from('manga')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo.toISOString())
      ]);

      return {
        total_manga: mangaRes.count || 0,
        total_artists: artistsRes.count || 0,
        total_tags: tagsRes.count || 0,
        recent_manga: recentRes.count || 0
      };
    } catch (err) {
      this.logger.error('Errore recupero stats', err);
      return {
        total_manga: 0,
        total_artists: 0,
        total_tags: 0,
        recent_manga: 0
      };
    }
  }

  /**
   * Ottieni i tag più popolari (con conteggio di utilizzo)
   */
  @Get('popular-tags')
  async getPopularTags(@Query('limit') limit?: string): Promise<{ nome: string; count: number }[]> {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 30;
      
      // Query più complessa per ottenere i tag con conteggio di utilizzo
      const { data, error } = await this.supabaseService.supabase
        .from('manga_tags')
        .select(`
          tag_id,
          tags!inner (
            nome
          )
        `);

      if (error) {
        this.logger.error('Errore recupero tag popolari:', error);
        return [];
      }

      // Raggruppa manualmente per conteggio
      const tagCountMap = new Map<string, number>();

      data?.forEach((item: any) => {
        if (item.tags?.nome) {
          const tagName = item.tags.nome;
          tagCountMap.set(tagName, (tagCountMap.get(tagName) || 0) + 1);
        }
      });

      // Converti in array, ordina per conteggio e prendi i primi N
      const result = Array.from(tagCountMap.entries())
        .map(([nome, count]) => ({ nome, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limitNum);

      return result;
    } catch (err) {
      this.logger.error('Errore recupero tag popolari', err);
      return [];
    }
  }

  /**
   * Ottieni statistiche rapide (manga, artisti, tags)
   */
  @Get('quick-stats')
  async getQuickStats(): Promise<{
    total_manga: number;
    total_artists: number;
    total_tags: number;
  }> {
    try {
      const [mangaRes, artistsRes, tagsRes] = await Promise.all([
        this.supabaseService.supabase.from('manga').select('*', { count: 'exact', head: true }),
        this.supabaseService.supabase.from('artisti').select('*', { count: 'exact', head: true }),
        this.supabaseService.supabase.from('tags').select('*', { count: 'exact', head: true }),
      ]);

      return {
        total_manga: mangaRes.count || 0,
        total_artists: artistsRes.count || 0,
        total_tags: tagsRes.count || 0,
      };
    } catch (err) {
      this.logger.error('Errore recupero quick stats', err);
      return {
        total_manga: 0,
        total_artists: 0,
        total_tags: 0,
      };
    }
  }

  /**
   * Riparazione globale dei link (privata)
   */
  private async runGlobalRepair(
    mangaList: MangaWithRelations[],
  ): Promise<void> {
    const serverVariants = [
      'i3', 'i7', 'i1', 'i2', 't', 't3', 'i5', 'i', 'i8',
    ];
    let fixedCount = 0;

    this.logger.log(
      `🔧 Avvio riparazione globale per ${mangaList.length} manga`,
    );

    for (const manga of mangaList) {
      if (!manga.immagine) continue;

      let isWorking = false;

      try {
        const check = await axios.head(manga.immagine, {
          timeout: 3000,
          headers: { Referer: 'https://hentaifox.com/' },
        });
        if (check.status === 200) isWorking = true;
      } catch {
        isWorking = false;
      }

      if (!isWorking) {
        for (const server of serverVariants) {
          try {
            const testUrl = manga.immagine.replace(
              /(i\d+|t\d*)\./,
              `${server}.`,
            );

            const check = await axios.head(testUrl, {
              timeout: 3000,
              headers: { Referer: 'https://hentaifox.com/' },
            });

            if (check.status === 200) {
              await this.supabaseService.supabase
                .from('manga')
                .update({ immagine: testUrl })
                .eq('id', manga.id);

              fixedCount++;
              this.logger.debug(`✅ Riparato manga ${manga.id}: ${server}`);
              break;
            }
          } catch {
            continue;
          }
        }
      }

      // Piccola pausa per evitare rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    this.logger.log(`✅ Manutenzione finita: ${fixedCount} asset riparati.`);
  }
}
