import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ImportService } from './import.service';
// ✅ USA 'import type' per i tipi usati nei decoratori
import type {
  BulkImportBody,
  ImportResult,
} from './interfaces/gallery.interface';

@Controller('import')
export class ImportController {
  private readonly logger = new Logger(ImportController.name);

  constructor(private readonly importService: ImportService) {}

  @Post('single')
  async importSingle(@Body('url') url: string): Promise<ImportResult> {
    if (!url) {
      throw new HttpException('URL mancante', HttpStatus.BAD_REQUEST);
    }
    return this.importService.importFromUrl(url);
  }

  @Post('bulk')
  async importBulk(@Body() body: BulkImportBody): Promise<{
    success: boolean;
    total: number;
    successful: number;
    failed: number;
    details: Array<ImportResult & { url: string }>;
  }> {
    if (!body.urls || !Array.isArray(body.urls)) {
      throw new HttpException('Lista URL non valida', HttpStatus.BAD_REQUEST);
    }

    const results: Array<ImportResult & { url: string }> = [];
    let successCount = 0;
    let failCount = 0;

    for (const url of body.urls) {
      if (!url) continue;

      try {
        const result = await this.importService.importFromUrl(url);
        results.push({ url, ...result });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Errore sconosciuto';
        results.push({
          url,
          success: false,
          error: errorMessage,
        });
        failCount++;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return {
      success: true,
      total: results.length,
      successful: successCount,
      failed: failCount,
      details: results,
    };
  }
}
