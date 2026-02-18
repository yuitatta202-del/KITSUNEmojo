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
import { SupabaseService } from '../supabase/supabase.service';
import * as ethers from 'ethers';
import axios, { AxiosError } from 'axios';
import type { Response } from 'express';

// Interfacce per il tipo di ritorno
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

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * 1. Recupera tutti i manga per l'interfaccia admin
   */
  @Get('manga')
  async getAll(): Promise<MangaWithRelations[]> {
    try {
      // Usa il metodo tipizzato del service
      return await this.supabaseService.getAllMangaAdmin();
    } catch (err) {
      this.logger.error('Errore durante il recupero dei manga admin', err);
      throw new InternalServerErrorException('Impossibile recuperare i manga.');
    }
  }

  /**
   * 2. PROXY IMMAGINI
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

  /**
   * 3. Update Visibilità
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

    if (wallet.toLowerCase() !== this.adminWallet) {
      throw new ForbiddenException('Accesso negato: Wallet non autorizzato.');
    }

    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
        throw new UnauthorizedException('Firma crittografica non valida.');
      }

      const mangaId = parseInt(id, 10);
      if (isNaN(mangaId)) {
        throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
      }

      // Usa il metodo del service
      const success = await this.supabaseService.updateMangaVisibility(
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
   * 4. ELIMINAZIONE MANGA
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

    if (wallet.toLowerCase() !== this.adminWallet) {
      throw new ForbiddenException('Accesso negato: Wallet non autorizzato.');
    }

    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
        throw new UnauthorizedException('Firma crittografica non valida.');
      }

      const mangaId = parseInt(id, 10);
      if (isNaN(mangaId)) {
        throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
      }

      // Elimina il manga
      const { error } = await this.supabaseService.supabase
        .from('manga')
        .delete()
        .eq('id', mangaId);

      if (error) {
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
   * 5. Tracking Eventi Analytics
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

      const { error } = await this.supabaseService.supabase
        .from('analytics_events')
        .insert({
          event_type: data.type,
          manga_id: data.mangaId || null,
          wallet_address: data.wallet || 'guest',
          user_agent: agent || null,
          path: null,
        });

      if (error) {
        this.logger.error('Errore tracking evento', error);
        return { success: false };
      }

      return { success: true };
    } catch (err) {
      this.logger.error('Eccezione tracking evento', err);
      return { success: false };
    }
  }

  /**
   * 6. Ottieni dettagli di un manga specifico
   */
  @Get('manga/:id')
  async getMangaById(@Param('id') id: string): Promise<MangaWithRelations> {
    try {
      const mangaId = parseInt(id, 10);
      if (isNaN(mangaId)) {
        throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
      }

      const manga = await this.supabaseService.getMangaById(mangaId);

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
}
