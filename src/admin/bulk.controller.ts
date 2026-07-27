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
import { ImportService } from '../import/import.service';
import type { ImportResult } from '../import/interfaces/gallery.interface';

// ✅ DEFINISCI UN TIPO CHE INCLUDE URL
type ImportResultWithUrl = ImportResult & { url: string };

@Controller('admin/bulk')
export class BulkController {
  private readonly logger = new Logger(BulkController.name);

  // In produzione, leggi da variabile d'ambiente
  private readonly adminWallet = (
    process.env.ADMIN_WALLET || '0x2aab3b9458cbb3709c6a131b1d9a7a0eb111efbc'
  ).toLowerCase();

  constructor(private readonly importService: ImportService) {}

  /**
   * Verifica che il wallet sia autorizzato
   */
  private verifyAdmin(wallet: string): void {
    if (!wallet || wallet.toLowerCase() !== this.adminWallet) {
      this.logger.warn(
        `[BULK-PROCESS] Tentativo non autorizzato da wallet: ${wallet}`,
      );
      throw new ForbiddenException(
        'Accesso negato: Solo il Master Node può importare.',
      );
    }
  }

  /**
   * Endpoint per l'importazione singola
   * URL: POST /admin/bulk/ingest
   */
  @Post('ingest')
  async ingestManga(
    @Body('url') url: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<ImportResultWithUrl> {
    // ✅ RIGA 52 - TIPO CORRETTO
    // Validazione input
    if (!url) {
      throw new HttpException('URL mancante', HttpStatus.BAD_REQUEST);
    }

    // Validazione URL
    try {
      new URL(url);
    } catch {
      throw new HttpException('URL non valido', HttpStatus.BAD_REQUEST);
    }

    // Verifica autorizzazione
    this.verifyAdmin(wallet);

    this.logger.log(`[BULK-PROCESS] Avvio ingestione: ${url}`);

    try {
      // Timeout per evitare richieste troppo lunghe
      const timeoutPromise = new Promise<ImportResult>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout dopo 60 secondi')), 60000);
      });

      // USA ImportService invece di SupabaseService
      const importPromise = this.importService.importFromUrl(url);

      const result = (await Promise.race([
        importPromise,
        timeoutPromise,
      ])) as ImportResult;

      // ✅ RIGA 104 - ORA TypeScript accetta l'oggetto con url
      const resultWithUrl: ImportResultWithUrl = {
        ...result,
        url,
      };

      // Log del risultato
      if (!result.success) {
        this.logger.error(`[BULK-PROCESS] Fallito: ${url} - ${result.error}`);
      } else {
        this.logger.log(
          `[BULK-PROCESS] Completato: ${result.title || 'Senza titolo'} - ID: ${result.id}`,
        );
      }

      return resultWithUrl;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';

      // Gestione specifica per timeout
      if (errorMessage.includes('Timeout')) {
        this.logger.error(`[BULK-PROCESS] Timeout: ${url}`);
        // ✅ RIGA 113 - ORA TypeScript accetta l'oggetto con url
        return {
          success: false,
          url,
          error: 'Richiesta troppo lunga, riprova più tardi',
        } as ImportResultWithUrl;
      }

      this.logger.error(`[BULK-PROCESS] Eccezione: ${url} - ${errorMessage}`);

      // ✅ RIGA 122 - ORA TypeScript accetta l'oggetto con url
      return {
        success: false,
        url,
        error: errorMessage,
      } as ImportResultWithUrl;
    }
  }

  /**
   * Endpoint per import multipli
   */
  @Post('ingest-multiple')
  async ingestMultipleManga(
    @Body('urls') urls: string[],
    @Headers('x-wallet') wallet: string,
  ): Promise<{
    results: ImportResultWithUrl[];
    total: number;
    successful: number;
    failed: number;
  }> {
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

    // Verifica autorizzazione
    this.verifyAdmin(wallet);

    this.logger.log(`[BULK-PROCESS] Import multiplo: ${urls.length} URL`);

    // ✅ RIGA 150 - USA IL TIPO ESTESO
    const results: ImportResultWithUrl[] = [];
    let successful = 0;
    let failed = 0;

    for (const url of urls) {
      if (!url) continue;

      try {
        const result = await this.importService.importFromUrl(url);
        // ✅ RIGA 159 - ORA TypeScript accetta l'oggetto con url
        const resultWithUrl: ImportResultWithUrl = { ...result, url };
        results.push(resultWithUrl);

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Log per ogni URL
        this.logger.log(
          `[BULK-PROCESS] ${result.success ? '✅' : '❌'} ${url} - ${result.title || 'Fallito'}`,
        );

        // Piccola pausa tra una richiesta e l'altra
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        failed++;
        // ✅ RIGA 176 - ORA TypeScript accetta l'oggetto con url
        results.push({
          success: false,
          url,
          error: err instanceof Error ? err.message : 'Errore sconosciuto',
        });
        this.logger.error(`[BULK-PROCESS] Errore su ${url}: ${err.message}`);
      }
    }

    this.logger.log(
      `[BULK-PROCESS] Completato: ${successful} successi, ${failed} falliti su ${urls.length} totali`,
    );

    return {
      results,
      total: urls.length,
      successful,
      failed,
    };
  }
}
