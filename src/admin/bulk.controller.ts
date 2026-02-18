import {
  Controller,
  Post,
  Body,
  Headers,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// Interfaccia per la risposta
interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
}

@Controller('admin/bulk')
export class BulkController {
  private readonly logger = new Logger(BulkController.name);
  private readonly adminWallet =
    '0x2aab3b9458cbb3709c6a131b1d9a7a0eb111efbc'.toLowerCase();

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Endpoint per l'importazione singola chiamata dal loop della pagina bulk
   * URL: POST http://localhost:3000/admin/bulk/ingest
   */
  @Post('ingest')
  async ingestManga(
    @Body('url') url: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<ImportResult> {
    // Validazione input
    if (!url) {
      throw new HttpException('URL mancante', HttpStatus.BAD_REQUEST);
    }

    // Sicurezza: solo l'admin può importare
    if (!wallet || wallet.toLowerCase() !== this.adminWallet) {
      throw new ForbiddenException(
        'Accesso negato: Solo il Master Node può importare.',
      );
    }

    this.logger.log(`[BULK-PROCESS] Avvio ingestione: ${url}`);

    try {
      // Chiama il metodo autoImport del service
      const result = await this.supabaseService.autoImport(url);

      // Log del risultato
      if (!result.success) {
        this.logger.error(`[BULK-PROCESS] Fallito: ${url} - ${result.error}`);
      } else {
        this.logger.log(
          `[BULK-PROCESS] Completato: ${result.title || 'Senza titolo'} - ID: ${result.id}`,
        );
      }

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`[BULK-PROCESS] Eccezione: ${url} - ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
