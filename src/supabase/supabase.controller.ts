import {
  Controller,
  Post,
  Body,
  Query,
  Logger,
  Get,
  Put,
  Delete,
  Param,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SupabaseService } from './supabase.service';

// Interfacce per i tipi di ritorno
interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
}

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

interface UpdateMangaPayload {
  titolo?: string;
  immagine?: string;
  lingua?: string;
  visible?: boolean;
  artista_id?: number | null;
  categoria_id?: number | null;
}

interface DeleteResult {
  success: boolean;
}

interface BulkImportBody {
  urls: string[];
}

interface BulkImportResult {
  success: boolean;
  processed: number;
  details: Array<ImportResult & { url: string }>;
}

@Controller('supabase')
export class SupabaseController {
  private readonly logger = new Logger(SupabaseController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  @Post('import')
  async importManga(@Query('url') url: string): Promise<ImportResult> {
    if (!url) {
      throw new HttpException(
        'URL mancante nella query string',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.logger.log(`📥 Avvio importazione singola per: ${url}`);
    return await this.supabaseService.autoImport(url);
  }

  @Post('bulk')
  async bulkImport(@Body() body: BulkImportBody): Promise<BulkImportResult> {
    if (!body.urls || !Array.isArray(body.urls)) {
      throw new HttpException('Lista URL non valida', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`🚀 Ricevuta richiesta Bulk per ${body.urls.length} URL`);
    const results: Array<ImportResult & { url: string }> = [];

    for (const url of body.urls) {
      if (!url) continue;
      try {
        const res = await this.supabaseService.autoImport(url);
        results.push({ url, ...res });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Errore sconosciuto';
        this.logger.error(`Fallimento su ${url}: ${message}`);
        results.push({ url, success: false, error: message });
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return { success: true, processed: results.length, details: results };
  }

  @Get('manga')
  async getAll(): Promise<MangaWithRelations[]> {
    this.logger.log('📋 Recupero lista manga completa');
    return await this.supabaseService.getAllMangaAdmin();
  }

  @Put('manga/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateMangaPayload,
  ): Promise<{ success: boolean; id: number }> {
    this.logger.log(`🔄 Aggiornamento manga ID: ${id}`);

    const { error } = await this.supabaseService.supabase
      .from('manga')
      .update(updateData)
      .eq('id', id);

    if (error) {
      this.logger.error(`Errore aggiornamento manga ${id}:`, error);
      throw new HttpException(
        "Errore durante l'aggiornamento",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { success: true, id };
  }

  @Delete('manga/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<DeleteResult> {
    this.logger.log(`🗑️ Eliminazione manga ID: ${id}`);

    const { error } = await this.supabaseService.supabase
      .from('manga')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error(`Errore eliminazione manga ${id}:`, error);
      throw new HttpException(
        "Errore durante l'eliminazione",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { success: true };
  }
}
