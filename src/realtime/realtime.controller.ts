import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { Observable, interval, map } from 'rxjs';

interface PresenceResponse {
  channel: string;
  users: any[];
  count: number;
}

interface TrackReadingBody {
  userWallet: string;
  mangaId: string;
  page: string;
}

interface ReadingSessionResponse {
  success: boolean;
  sessionId?: number;
}

@Controller('realtime')
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);

  constructor(private readonly realtimeService: RealtimeService) {}

  /**
   * GET /realtime/status
   * Ottieni lo stato delle connessioni real-time
   */
  @Get('status')
  getStatus(): any {
    return this.realtimeService.getRealtimeStats();
  }

  /**
   * GET /realtime/readers/:mangaId
   * Ottieni i lettori attivi per un manga
   */
  @Get('readers/:mangaId')
  getActiveReaders(@Param('mangaId') mangaId: string): PresenceResponse {
    const mangaIdNum = parseInt(mangaId, 10);
    if (isNaN(mangaIdNum) || mangaIdNum <= 0) {
      throw new HttpException('ID manga non valido', HttpStatus.BAD_REQUEST);
    }

    const readers = this.realtimeService.getActiveReaders(mangaIdNum);

    return {
      channel: `manga:${mangaIdNum}:presence`,
      users: readers,
      count: readers.length,
    };
  }

  /**
   * POST /realtime/track
   * Traccia una sessione di lettura
   */
  @Post('track')
  async trackReading(
    @Body() body: TrackReadingBody,
    @Headers('x-wallet') wallet?: string,
  ): Promise<ReadingSessionResponse> {
    const userWallet = wallet || body.userWallet;

    if (!userWallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    if (!body.mangaId || !body.page) {
      throw new HttpException('Dati incompleti', HttpStatus.BAD_REQUEST);
    }

    // Converti le stringhe in numeri per il servizio
    const mangaIdNum = parseInt(body.mangaId, 10);
    const pageNum = parseInt(body.page, 10);

    if (isNaN(mangaIdNum) || mangaIdNum <= 0) {
      throw new HttpException('ID manga non valido', HttpStatus.BAD_REQUEST);
    }

    if (isNaN(pageNum) || pageNum <= 0) {
      throw new HttpException(
        'Numero pagina non valido',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // startReadingSession(wallet: string, mangaId: number, deviceType?: string)
      const result = await this.realtimeService.startReadingSession(
        userWallet.toLowerCase(),
        mangaIdNum,
      );

      // Aggiorna alla pagina corretta
      if (result?.sessionId) {
        await this.realtimeService.updateReadingPage(
          result.sessionId,
          mangaIdNum,
          pageNum,
          userWallet.toLowerCase(),
        );
      }

      return {
        success: true,
        sessionId: result?.sessionId,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Error tracking reading session: ${errorMessage}`);
      throw new HttpException(
        'Errore nel tracking',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /realtime/presence/:mangaId
   * Traccia la presenza di un lettore
   */
  @Post('presence/:mangaId')
  async trackPresence(
    @Param('mangaId') mangaId: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<{ success: boolean; channel: string }> {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const mangaIdNum = parseInt(mangaId, 10);
    if (isNaN(mangaIdNum) || mangaIdNum <= 0) {
      throw new HttpException('ID manga non valido', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.realtimeService.trackOnlineReaders(
        mangaIdNum,
        wallet.toLowerCase(),
      );

      return {
        success: true,
        channel: `manga:${mangaIdNum}:presence`,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Error tracking presence: ${errorMessage}`);
      throw new HttpException(
        'Errore nel tracking presenza',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /realtime/session/:mangaId
   * Termina una sessione di lettura
   */
  /**
   * DELETE /realtime/session/:mangaId
   * Termina una sessione di lettura
   */
  @Delete('session/:mangaId')
  async endSession(
    @Param('mangaId') mangaId: string,
    @Headers('x-wallet') wallet: string,
    @Body('sessionId') sessionId?: number,
  ): Promise<{ success: boolean }> {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const mangaIdNum = parseInt(mangaId, 10);
    if (isNaN(mangaIdNum) || mangaIdNum <= 0) {
      throw new HttpException('ID manga non valido', HttpStatus.BAD_REQUEST);
    }

    try {
      // Se sessionId non è fornito, cerca la sessione attiva
      if (!sessionId) {
        const { data, error } = await this.realtimeService[
          'supabaseService'
        ].supabase
          .from('reading_sessions')
          .select('id')
          .eq('user_wallet', wallet.toLowerCase())
          .eq('manga_id', mangaIdNum)
          .is('end_time', null)
          .order('start_time', { ascending: false })
          .limit(1)
          .single();

        if (error || !data) {
          throw new HttpException(
            'Nessuna sessione attiva trovata',
            HttpStatus.NOT_FOUND,
          );
        }
        sessionId = (data as any).id;
      }

      // Ora sessionId è sicuramente definito
      await this.realtimeService.endReadingSession(
        sessionId!, // number (garantito con !)
        mangaIdNum, // number
        wallet.toLowerCase(), // string
      );
      return { success: true };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto';
      this.logger.error(`Error ending session: ${errorMessage}`);
      throw new HttpException(
        'Errore nella chiusura sessione',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * SSE /realtime/events
   * Server-Sent Events per aggiornamenti in tempo reale
   */
  @Sse('events')
  sendEvents(): Observable<MessageEvent> {
    return interval(5000).pipe(
      map(() => ({
        data: {
          timestamp: new Date().toISOString(),
          stats: this.realtimeService.getRealtimeStats(),
        },
      })),
    );
  }
}
