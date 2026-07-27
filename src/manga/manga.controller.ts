import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  Query,
  Res,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { MangaService, HomeMangaResponse, QuickStats } from './manga.service';
import { SupabaseService } from '../supabase/supabase.service';
import * as ethers from 'ethers';
import axios, { AxiosError } from 'axios';
import type { Response } from 'express';

// ============================================
// INTERFACCE LOCALI
// ============================================

interface AdminMangaResponse {
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
  artisti: { id: number; nome: string; counter: number | null } | null;
  categorie: { id: number; nome: string; counter: number | null } | null;
  tags?: { id: number; nome: string; counter: number | null }[];
}

interface AdminMangaListResponse {
  data: AdminMangaResponse[];
  total: number;
  publicCount: number;
  hiddenCount: number;
}

interface TrackEventData {
  type: string;
  mangaId?: number;
  wallet?: string;
}

interface UpdateVisibilityResponse {
  success: boolean;
  updatedId: number;
  visible: boolean;
}

interface DeleteResponse {
  success: boolean;
  message: string;
}

interface TrackEventResponse {
  success: boolean;
  error?: string;
}

@Controller('admin')
export class MangaController {
  private readonly logger = new Logger(MangaController.name);
  private readonly adminWallet =
    '0x2aab3b9458cbb3709c6a131b1d9a7a0eb111efbc'.toLowerCase();

  constructor(
    private readonly mangaService: MangaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // ============================================
  // ENDPOINT PUBBLICI PER LA HOME PAGE
  // ============================================

  /**
   * GET /admin/manga
   * Recupera tutti i manga visibili per la homepage (versione leggera)
   */
  @Get('manga')
  async getHomeManga(): Promise<HomeMangaResponse[]> {
    try {
      return await this.mangaService.getHomeManga();
    } catch (err) {
      this.logger.error('Errore recupero manga homepage:', err);
      throw new HttpException(
        'Errore nel recupero dei manga',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/quick-stats
   * Recupera statistiche rapide per la homepage
   */
  @Get('quick-stats')
  async getQuickStats(): Promise<QuickStats> {
    try {
      return await this.mangaService.getQuickStats();
    } catch (err) {
      this.logger.error('Errore recupero quick stats:', err);
      throw new HttpException(
        'Errore nel recupero delle statistiche',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/proxy
   * Proxy per immagini (evita CORS)
   */
  @Get('proxy')
  async proxyImage(@Query('url') imageUrl: string, @Res() res: Response) {
    if (!imageUrl) {
      throw new HttpException('URL mancante', HttpStatus.BAD_REQUEST);
    }

    const cleanUrl = imageUrl
      .replace(/(\.(jpg|jpeg|png|webp|avif)).*/i, '$1')
      .replace(/['"]/g, '');

    try {
      const response = await axios.get<Buffer>(cleanUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://hentaifox.com/',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });

      const contentType =
        (response.headers['content-type'] as string) || 'image/jpeg';

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=604800, immutable');
      res.set('Access-Control-Allow-Origin', '*');

      return res.send(response.data);
    } catch (error: unknown) {
      this.logger.error(`🔴 PROXY ERROR su: ${cleanUrl}`);
      if (error instanceof AxiosError) {
        this.logger.error(`Status: ${error.response?.status || 'Timeout'}`);
      }
      throw new HttpException(
        'Immagine non raggiungibile',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // ============================================
  // ENDPOINT PROTETTI PER ADMIN (con autenticazione)
  // ============================================

  /**
   * GET /admin/manga/details
   * Recupera tutti i manga per admin (versione completa con conteggi)
   *
   * ⚠️ IMPORTANTE: Questo endpoint DEVE essere PRIMA di /manga/:id
   */
  @Get('manga/details')
  async getAllForAdmin(): Promise<AdminMangaListResponse> {
    try {
      this.logger.log('📋 Richiesta a /admin/manga/details');
      const result = await this.mangaService.getAllForAdminWithCount();

      return {
        data: result.data as AdminMangaResponse[],
        total: result.total,
        publicCount: result.publicCount,
        hiddenCount: result.hiddenCount,
      };
    } catch (err) {
      this.logger.error('Errore durante il recupero dei manga admin', err);
      throw new InternalServerErrorException('Impossibile recuperare i manga.');
    }
  }

  /**
   * GET /admin/manga/:id
   * Recupera dettagli di un manga specifico
   *
   * ⚠️ IMPORTANTE: Questo endpoint DEVE essere DOPO /manga/details
   */
  @Get('manga/:id')
  async getMangaById(@Param('id') id: string): Promise<HomeMangaResponse> {
    try {
      const mangaId = parseInt(id, 10);
      if (isNaN(mangaId)) {
        throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
      }

      const manga = await this.mangaService.getMangaById(mangaId);

      if (!manga) {
        throw new HttpException('Manga non trovato', HttpStatus.NOT_FOUND);
      }

      return manga;
    } catch (err) {
      this.logger.error(`Errore recupero manga ${id}`, err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new InternalServerErrorException(
        'Impossibile recuperare il manga.',
      );
    }
  }

  /**
   * PUT /admin/manga/:id/visibility
   * Aggiorna la visibilità di un manga (richiede firma)
   */
  @Put('manga/:id/visibility')
  async updateVisibility(
    @Param('id') id: string,
    @Body('visible') visible: boolean,
    @Headers('x-signature') signature: string,
    @Headers('x-message') message: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<UpdateVisibilityResponse> {
    // Validazione input
    if (!id || visible === undefined || !signature || !message || !wallet) {
      throw new UnauthorizedException('Dati di sicurezza incompleti.');
    }

    // Verifica wallet autorizzato
    if (wallet.toLowerCase() !== this.adminWallet) {
      throw new ForbiddenException('Accesso negato: Wallet non autorizzato.');
    }

    try {
      // Verifica firma crittografica
      const recoveredAddress = ethers.verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
        throw new UnauthorizedException('Firma crittografica non valida.');
      }

      const mangaId = parseInt(id, 10);
      if (isNaN(mangaId)) {
        throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
      }

      const success = await this.mangaService.updateVisibility(
        mangaId,
        visible,
      );

      if (!success) {
        throw new InternalServerErrorException(
          "Errore durante l'aggiornamento della visibilità.",
        );
      }

      return { success: true, updatedId: mangaId, visible };
    } catch (err) {
      this.logger.error(
        `Errore visibilità: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
      if (
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException ||
        err instanceof HttpException
      ) {
        throw err;
      }
      throw new InternalServerErrorException(
        'Errore database o verifica firma.',
      );
    }
  }

  /**
   * DELETE /admin/manga/:id
   * Elimina un manga (richiede firma)
   */
  @Delete('manga/:id')
  async deleteManga(
    @Param('id') id: string,
    @Headers('x-signature') signature: string,
    @Headers('x-message') message: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<DeleteResponse> {
    // Validazione input
    if (!id || !signature || !message || !wallet) {
      throw new UnauthorizedException('Protocollo di sicurezza incompleto.');
    }

    // Verifica wallet autorizzato
    if (wallet.toLowerCase() !== this.adminWallet) {
      throw new ForbiddenException('Accesso negato: Wallet non autorizzato.');
    }

    try {
      // Verifica firma crittografica
      const recoveredAddress = ethers.verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
        throw new UnauthorizedException('Firma crittografica non valida.');
      }

      const mangaId = parseInt(id, 10);
      if (isNaN(mangaId)) {
        throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
      }

      const success = await this.mangaService.deleteManga(mangaId);

      if (!success) {
        throw new InternalServerErrorException(
          "Errore durante l'eliminazione.",
        );
      }

      return { success: true, message: 'Asset eliminato con successo.' };
    } catch (err) {
      this.logger.error(`[DELETE ERROR] ID ${id}`, err);
      if (
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException ||
        err instanceof HttpException
      ) {
        throw err;
      }
      throw new UnauthorizedException('Errore validazione protocollo.');
    }
  }

  /**
   * POST /admin/track/event
   * Traccia eventi analytics
   */
  @Post('track/event')
  async trackEvent(
    @Body() data: TrackEventData,
    @Headers('user-agent') agent: string,
  ): Promise<TrackEventResponse> {
    try {
      if (!data.type) {
        return { success: false, error: 'Tipo evento mancante' };
      }

      const success = await this.supabaseService.trackEvent({
        eventType: data.type,
        mangaId: data.mangaId,
        wallet: data.wallet,
        userAgent: agent,
      });

      if (!success) {
        return { success: false, error: 'Errore durante il tracking' };
      }

      return { success: true };
    } catch (err) {
      this.logger.error('Eccezione tracking evento', err);
      return { success: false, error: 'Eccezione durante il tracking' };
    }
  }
}
