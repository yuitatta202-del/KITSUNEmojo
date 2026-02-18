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

// Interfaccia per la risposta - AGGIUNTA PROPRIETÀ 'url'
interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
  url?: string; // ← AGGIUNTO per gestire l'URL nell'import multiplo
}

@Controller('admin/bulk')
export class BulkController {
  private readonly logger = new Logger(BulkController.name);

  // In produzione, leggi da variabile d'ambiente (su una riga sola)
  private readonly adminWallet = (
    process.env.ADMIN_WALLET || '0x2aab3b9458cbb3709c6a131b1d9a7a0eb111efbc'
  ).toLowerCase();

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Endpoint per l'importazione singola chiamata dal loop della pagina bulk
   * URL: POST /admin/bulk/ingest
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

    // Validazione URL (protezione base)
    try {
      new URL(url);
    } catch {
      throw new HttpException('URL non valido', HttpStatus.BAD_REQUEST);
    }

    // Sicurezza: solo l'admin può importare
    if (!wallet || wallet.toLowerCase() !== this.adminWallet) {
      this.logger.warn(
        `[BULK-PROCESS] Tentativo non autorizzato da wallet: ${wallet}`,
      );
      throw new ForbiddenException(
        'Accesso negato: Solo il Master Node può importare.',
      );
    }

    this.logger.log(`[BULK-PROCESS] Avvio ingestione: ${url}`);

    try {
      // Timeout per evitare richieste troppo lunghe
      const timeoutPromise = new Promise<ImportResult>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout dopo 60 secondi')), 60000);
      });

      const importPromise = this.supabaseService.autoImport(url);

      const result = (await Promise.race([
        importPromise,
        timeoutPromise,
      ])) as ImportResult;

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
      const errorMessage = err instanceof Error ? err.message : 'Errore sconosciuto';

      // Gestione specifica per timeout
      if (errorMessage.includes('Timeout')) {
        this.logger.error(`[BULK-PROCESS] Timeout: ${url}`);
        return {
          success: false,
          error: 'Richiesta troppo lunga, riprova più tardi',
        };
      }

      this.logger.error(`[BULK-PROCESS] Eccezione: ${url} - ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Endpoint opzionale per import multipli (se vuoi ottimizzare)
   * Invece di chiamare /ingest per ogni URL, puoi inviarli tutti insieme
   */
  @Post('ingest-multiple')
  async ingestMultipleManga(
    @Body('urls') urls: string[],
    @Headers('x-wallet') wallet: string,
  ): Promise<{ results: ImportResult[] }> {
    // Validazione
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      throw new HttpException('Lista URL mancante', HttpStatus.BAD_REQUEST);
    }

    // Limite per evitare overload
    if (urls.length > 50) {
      throw new HttpException(
        'Troppi URL (max 50 per volta)',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Sicurezza
    if (!wallet || wallet.toLowerCase() !== this.adminWallet) {
      throw new ForbiddenException('Accesso negato');
    }

    this.logger.log(`[BULK-PROCESS] Import multiplo: ${urls.length} URL`);

    // Processa in sequenza per non sovraccaricare
    const results: ImportResult[] = [];
    for (const url of urls) {
      try {
        const result = await this.supabaseService.autoImport(url);
        results.push(result);

        // Piccola pausa tra una richiesta e l'altra
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        results.push({
          success: false,
          url: url, // ← ORA FUNZIONA perché abbiamo aggiunto url all'interfaccia
          error: err instanceof Error ? err.message : 'Errore',
        });
      }
    }

    return { results };
  }
}
