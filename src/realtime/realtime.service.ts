import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================
// INTERFACCE
// ============================================

export interface ActiveReader {
  wallet: string;
  currentPage: number;
  lastUpdate: Date;
  deviceType?: string;
}

export interface ReadingSessionData {
  id: number;
  user_wallet: string;
  manga_id: number;
  start_time: string;
  current_page?: number;
  end_time?: string;
  session_duration?: number;
}

export interface RealtimeUpdate {
  type: 'page_turn' | 'session_start' | 'session_end';
  mangaId: number;
  wallet: string;
  page?: number;
  timestamp: Date;
}

export interface ChannelMessage {
  type: 'broadcast';
  event: string;
  payload: Record<string, unknown>;
}

export interface PageTurnPayload {
  wallet: string;
  page: number;
}

export interface SessionStartPayload {
  wallet: string;
  page: number;
  deviceType?: string;
}

export interface SessionEndPayload {
  wallet: string;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private activeChannels: Map<string, RealtimeChannel> = new Map();
  private activeReaders: Map<number, Map<string, ActiveReader>> = new Map();

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Crea un nuovo canale per un manga
   */
  createMangaChannel(mangaId: number): RealtimeChannel {
    const channelKey = `manga:${mangaId}`;

    // Se esiste già, rimuovilo
    if (this.activeChannels.has(channelKey)) {
      const existingChannel = this.activeChannels.get(channelKey);
      if (existingChannel) {
        existingChannel.unsubscribe();
      }
      this.activeChannels.delete(channelKey);
    }

    // Crea il canale
    const channel = this.supabaseService.supabase.channel(channelKey);

    // Setup listeners
    channel
      .on('broadcast' as any, { event: 'page_turn' }, (payload: any) => {
        this.handlePageTurn(mangaId, payload);
      })
      .on('broadcast' as any, { event: 'session_start' }, (payload: any) => {
        this.handleSessionStart(mangaId, payload);
      })
      .on('broadcast' as any, { event: 'session_end' }, (payload: any) => {
        this.handleSessionEnd(mangaId, payload);
      })
      .subscribe((status: string) => {
        this.logger.log(`Channel ${channelKey} status: ${status}`);
      });

    this.activeChannels.set(channelKey, channel);

    // Inizializza la mappa dei lettori attivi
    if (!this.activeReaders.has(mangaId)) {
      this.activeReaders.set(mangaId, new Map());
    }

    return channel;
  }

  /**
   * Ottieni statistiche in tempo reale
   */
  getRealtimeStats(): {
    activeChannels: number;
    activeReaders: Record<string, number>;
    totalReaders: number;
    timestamp: string;
  } {
    const activeReadersByManga: Record<string, number> = {};
    let totalReaders = 0;

    // Calcola statistiche dai lettori attivi
    for (const [mangaId, readers] of this.activeReaders.entries()) {
      const count = readers.size;
      activeReadersByManga[`manga_${mangaId}`] = count;
      totalReaders += count;
    }

    return {
      activeChannels: this.activeChannels.size,
      activeReaders: activeReadersByManga,
      totalReaders,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Ottieni un canale esistente o creane uno nuovo
   */
  getChannel(mangaId: number): RealtimeChannel {
    const channelKey = `manga:${mangaId}`;

    if (this.activeChannels.has(channelKey)) {
      const channel = this.activeChannels.get(channelKey);
      if (channel) return channel;
    }

    return this.createMangaChannel(mangaId);
  }

  /**
   * Invia un aggiornamento a tutti i client su un manga
   */
  async broadcastToManga(
    mangaId: number,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const channel = this.getChannel(mangaId);

    const message: ChannelMessage = {
      type: 'broadcast',
      event,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    };

    await channel.send(message);
  }

  /**
   * Inizia una sessione di lettura
   */
  async startReadingSession(
    wallet: string,
    mangaId: number,
    deviceType?: string,
  ): Promise<{ sessionId: number }> {
    const normalizedWallet = wallet.toLowerCase();

    try {
      const insertData = {
        user_wallet: normalizedWallet,
        manga_id: mangaId,
        start_time: new Date().toISOString(),
        current_page: 1,
      };

      const { data, error } = await this.supabaseService.supabase
        .from('reading_sessions')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;

      const sessionData = data as ReadingSessionData;

      // Aggiungi ai lettori attivi
      this.addActiveReader(mangaId, normalizedWallet, 1, deviceType);

      // Broadcast inizio sessione
      await this.broadcastToManga(mangaId, 'session_start', {
        wallet: normalizedWallet,
        page: 1,
        deviceType,
      });

      return { sessionId: sessionData.id };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error starting reading session: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Aggiorna la pagina corrente durante la lettura
   */
  async updateReadingPage(
    sessionId: number,
    mangaId: number,
    page: number,
    wallet: string,
  ): Promise<void> {
    const normalizedWallet = wallet.toLowerCase();

    try {
      const updateData = {
        current_page: page,
        last_update: new Date().toISOString(),
      };

      const { error } = await this.supabaseService.supabase
        .from('reading_sessions')
        .update(updateData as never)
        .eq('id', sessionId);

      if (error) throw error;

      // Aggiorna lettori attivi
      this.updateActiveReader(mangaId, normalizedWallet, page);

      // Broadcast cambio pagina
      await this.broadcastToManga(mangaId, 'page_turn', {
        wallet: normalizedWallet,
        page,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error updating reading page: ${errorMessage}`);
    }
  }

  /**
   * Termina una sessione di lettura
   */
  async endReadingSession(
    sessionId: number,
    mangaId: number,
    wallet: string,
  ): Promise<void> {
    const normalizedWallet = wallet.toLowerCase();

    try {
      const endTime = new Date().toISOString();

      // Calcola durata (sarebbe meglio prendere start_time dal DB)
      const updateData = {
        end_time: endTime,
        session_duration: 0, // Idealmente calcolato da start_time
      };

      const { error } = await this.supabaseService.supabase
        .from('reading_sessions')
        .update(updateData as never)
        .eq('id', sessionId);

      if (error) throw error;

      // Rimuovi dai lettori attivi
      this.removeActiveReader(mangaId, normalizedWallet);

      // Broadcast fine sessione
      await this.broadcastToManga(mangaId, 'session_end', {
        wallet: normalizedWallet,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error ending reading session: ${errorMessage}`);
    }
  }

  /**
   * Ottieni i lettori attivi per un manga
   */
  getActiveReaders(mangaId: number): ActiveReader[] {
    const readers = this.activeReaders.get(mangaId);
    if (!readers) return [];

    return Array.from(readers.values())
      .filter((reader) => {
        // Rimuovi lettori inattivi da più di 2 minuti
        const inactive =
          new Date().getTime() - reader.lastUpdate.getTime() > 120000;
        return !inactive;
      })
      .map((reader) => ({
        ...reader,
        lastUpdate: new Date(reader.lastUpdate), // Assicura che sia un oggetto Date
      }));
  }

  /**
   * Traccia una sessione di lettura (metodo richiesto dal controller)
   */
  async trackReadingSession(
    wallet: string,
    mangaId: number,
    page: string | number,
  ): Promise<void> {
    try {
      const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;

      // Verifica se esiste una sessione attiva
      // Questo è un esempio semplificato - dovresti implementare la logica completa
      this.logger.log(
        `Tracking reading session for ${wallet} on manga ${mangaId} at page ${pageNum}`,
      );

      // Aggiorna i lettori attivi
      this.addActiveReader(mangaId, wallet, pageNum);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error in trackReadingSession: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Traccia lettori online (metodo richiesto dal controller)
   */
  async trackOnlineReaders(mangaId: number, wallet: string): Promise<void> {
    try {
      // Aggiorna o aggiungi il lettore alla lista dei lettori attivi
      const readers = this.activeReaders.get(mangaId);
      if (readers && readers.has(wallet)) {
        const reader = readers.get(wallet)!;
        reader.lastUpdate = new Date();
      } else {
        this.addActiveReader(mangaId, wallet, 1);
      }

      this.logger.debug(`User ${wallet} online on manga ${mangaId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error in trackOnlineReaders: ${errorMessage}`);
      throw err;
    }
  }

  /**
   * Pulisci i canali inattivi
   */
  cleanupInactiveChannels(): void {
    for (const [key, channel] of this.activeChannels.entries()) {
      try {
        channel.unsubscribe();
        this.activeChannels.delete(key);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Error cleaning up channel ${key}: ${errorMessage}`);
      }
    }
  }

  /**
   * Gestisce eventi di cambio pagina
   */
  private handlePageTurn(mangaId: number, payload: any): void {
    try {
      const { wallet, page } = payload as PageTurnPayload;
      if (wallet && typeof page === 'number') {
        this.updateActiveReader(mangaId, wallet, page);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error handling page turn: ${errorMessage}`);
    }
  }

  /**
   * Gestisce eventi di inizio sessione
   */
  private handleSessionStart(mangaId: number, payload: any): void {
    try {
      const { wallet, page, deviceType } = payload as SessionStartPayload;
      if (wallet && typeof page === 'number') {
        this.addActiveReader(mangaId, wallet, page, deviceType);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error handling session start: ${errorMessage}`);
    }
  }

  /**
   * Gestisce eventi di fine sessione
   */
  private handleSessionEnd(mangaId: number, payload: any): void {
    try {
      const { wallet } = payload as SessionEndPayload;
      if (wallet) {
        this.removeActiveReader(mangaId, wallet);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error handling session end: ${errorMessage}`);
    }
  }

  /**
   * Aggiunge un lettore attivo
   */
  private addActiveReader(
    mangaId: number,
    wallet: string,
    page: number,
    deviceType?: string,
  ): void {
    if (!this.activeReaders.has(mangaId)) {
      this.activeReaders.set(mangaId, new Map<string, ActiveReader>());
    }

    const readers = this.activeReaders.get(mangaId)!;

    readers.set(wallet, {
      wallet,
      currentPage: page,
      lastUpdate: new Date(),
      deviceType,
    });
  }

  /**
   * Aggiorna un lettore attivo
   */
  private updateActiveReader(
    mangaId: number,
    wallet: string,
    page: number,
  ): void {
    const readers = this.activeReaders.get(mangaId);
    if (!readers || !readers.has(wallet)) return;

    const reader = readers.get(wallet)!;
    reader.currentPage = page;
    reader.lastUpdate = new Date();
  }

  /**
   * Rimuove un lettore attivo
   */
  private removeActiveReader(mangaId: number, wallet: string): void {
    const readers = this.activeReaders.get(mangaId);
    if (readers) {
      readers.delete(wallet);
      if (readers.size === 0) {
        this.activeReaders.delete(mangaId);
      }
    }
  }
}
