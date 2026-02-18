import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  RealtimeChannel,
  REALTIME_SUBSCRIBE_STATES,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

interface ReadingSessionData {
  sessionId?: number;
  userWallet: string;
  mangaId: number;
  currentPage: number;
  startTime: Date;
  lastUpdate: Date;
}

interface PresenceData {
  user: string;
  online_at: string;
  user_agent: string;
}

interface BroadcastPayload {
  wallet: string;
  mangaId: number;
  page: number;
  timestamp: string;
}

// Tipo per il payload della presenza
interface PresenceState {
  [key: string]: PresenceData[];
}

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private activeChannels: Map<string, RealtimeChannel> = new Map();
  private activeSessions: Map<string, ReadingSessionData> = new Map();

  constructor(private supabaseService: SupabaseService) {
    this.logger.log('🚀 RealtimeService initialized');
  }

  /**
   * Setup per tracking letture in tempo reale
   */
  async trackReadingSession(
    userWallet: string,
    mangaId: number,
    page: number,
  ): Promise<void> {
    const client = this.supabaseService.supabase;
    const sessionKey = `${userWallet}:${mangaId}`;

    try {
      // Verifica se esiste già una sessione attiva
      let sessionData = this.activeSessions.get(sessionKey);

      if (!sessionData) {
        // Crea nuova sessione nel database
        const { data, error } = await client
          .from('reading_sessions')
          .insert({
            user_wallet: userWallet,
            manga_id: mangaId,
            start_time: new Date().toISOString(),
            current_page: page,
          })
          .select('id')
          .single();

        if (error) throw error;

        if (!data) throw new Error('No data returned from insert');

        // Cast esplicito per evitare l'errore no-unsafe-assignment
        const sessionId = Number(data.id);

        sessionData = {
          sessionId,
          userWallet,
          mangaId,
          currentPage: page,
          startTime: new Date(),
          lastUpdate: new Date(),
        };

        this.activeSessions.set(sessionKey, sessionData);
        this.logger.debug(`📖 New reading session: ${sessionKey}`);
      }

      // Usa broadcast per aggiornamenti in tempo reale
      const channelKey = `manga:${mangaId}:reading`;
      let channel = this.activeChannels.get(channelKey);

      if (!channel) {
        channel = client.channel(channelKey, {
          config: { private: false }, // pubblico per demo
        });

        // Usa un tipo più generico per il payload del broadcast
        channel
          .on('broadcast' as any, { event: 'page_turn' }, (payload: any) => {
            // Validazione del payload a runtime
            if (
              payload &&
              typeof payload === 'object' &&
              'wallet' in payload &&
              'mangaId' in payload &&
              'page' in payload
            ) {
              const broadcastPayload = payload as BroadcastPayload;
              this.logger.debug(
                `📖 ${broadcastPayload.wallet} reading page ${broadcastPayload.page} of manga ${broadcastPayload.mangaId}`,
              );
            }
          })
          .subscribe((status) => {
            if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
              this.logger.debug(`✅ Subscribed to ${channelKey}`);
            }
          });

        this.activeChannels.set(channelKey, channel);
      }

      // Broadcast il cambio pagina
      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'page_turn',
          payload: {
            wallet: userWallet,
            mangaId,
            page,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Aggiorna sessione
      await this.updateReadingSession(userWallet, mangaId, page);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`❌ Error tracking reading session: ${errorMessage}`);
    }
  }

  /**
   * Presence per vedere chi sta leggendo ora
   */
  async trackOnlineReaders(
    mangaId: number,
    userWallet: string,
  ): Promise<RealtimeChannel | null> {
    const client = this.supabaseService.supabase;
    const channelKey = `manga:${mangaId}:presence`;

    try {
      let channel = this.activeChannels.get(channelKey);

      if (!channel) {
        channel = client.channel(channelKey);

        // Gestisci eventi di presence
        channel
          .on('presence', { event: 'sync' }, () => {
            if (!channel) return;
            const state = channel.presenceState() as PresenceState;
            const readerCount = Object.keys(state).length;
            this.logger.debug(
              `🔄 Presence sync for manga ${mangaId}: ${readerCount} readers`,
            );
          })
          .on('presence', { event: 'join' }, ({ key }) => {
            this.logger.debug(`👋 ${key} joined reading manga ${mangaId}`);
          })
          .on('presence', { event: 'leave' }, ({ key }) => {
            this.logger.debug(`🚪 ${key} left manga ${mangaId}`);
          });

        channel.subscribe((status) => {
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED && channel) {
            channel
              .track({
                user: userWallet,
                online_at: new Date().toISOString(),
                user_agent: 'web',
              })
              .then(() => {
                this.logger.debug(
                  `✅ Subscribed to presence for manga ${mangaId}`,
                );
              })
              .catch((err) => {
                const errorMessage =
                  err instanceof Error ? err.message : 'Unknown error';
                this.logger.error(
                  `❌ Error tracking presence: ${errorMessage}`,
                );
              });
          }
        });

        this.activeChannels.set(channelKey, channel);
      } else {
        // Aggiorna presenza
        await channel.track({
          user: userWallet,
          online_at: new Date().toISOString(),
          user_agent: 'web',
        });
      }

      return channel;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`❌ Error tracking presence: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Ottieni lista lettori attivi per un manga
   */
  getActiveReaders(mangaId: number): PresenceData[] {
    const channelKey = `manga:${mangaId}:presence`;
    const channel = this.activeChannels.get(channelKey);

    if (!channel) return [];

    const presenceState = channel.presenceState() as PresenceState;
    const readers: PresenceData[] = [];

    for (const presences of Object.values(presenceState)) {
      if (presences && presences.length > 0) {
        readers.push(presences[0]);
      }
    }

    return readers;
  }

  /**
   * Aggiorna sessione di lettura
   */
  private async updateReadingSession(
    userWallet: string,
    mangaId: number,
    page: number,
  ): Promise<void> {
    const client = this.supabaseService.supabase;
    const sessionKey = `${userWallet}:${mangaId}`;
    const sessionData = this.activeSessions.get(sessionKey);

    if (!sessionData?.sessionId) return;

    try {
      // Aggiorna la sessione ogni 10 pagine o ogni minuto
      const shouldUpdate =
        page % 10 === 0 ||
        Date.now() - sessionData.lastUpdate.getTime() > 60000;

      if (shouldUpdate) {
        await client
          .from('reading_sessions')
          .update({
            current_page: page,
            last_update: new Date().toISOString(),
          })
          .eq('id', sessionData.sessionId);

        sessionData.lastUpdate = new Date();
        sessionData.currentPage = page;
        this.activeSessions.set(sessionKey, sessionData);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`❌ Error updating session: ${errorMessage}`);
    }
  }

  /**
   * Termina una sessione di lettura
   */
  async endReadingSession(userWallet: string, mangaId: number): Promise<void> {
    const client = this.supabaseService.supabase;
    const sessionKey = `${userWallet}:${mangaId}`;
    const sessionData = this.activeSessions.get(sessionKey);

    if (sessionData?.sessionId) {
      try {
        const endTime = new Date();
        const duration = Math.floor(
          (endTime.getTime() - sessionData.startTime.getTime()) / 1000,
        );

        await client
          .from('reading_sessions')
          .update({
            end_time: endTime.toISOString(),
            session_duration: duration,
          })
          .eq('id', sessionData.sessionId);

        this.activeSessions.delete(sessionKey);
        this.logger.debug(
          `✅ Session ended for ${sessionKey}, duration: ${duration}s`,
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`❌ Error ending session: ${errorMessage}`);
      }
    }

    // Rimuovi dalla presenza
    const channelKey = `manga:${mangaId}:presence`;
    const channel = this.activeChannels.get(channelKey);
    if (channel) {
      await channel.untrack();
    }
  }

  /**
   * Pulisci tutte le connessioni (chiamato allo shutdown)
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('🔄 Cleaning up Realtime connections...');

    for (const [key, channel] of this.activeChannels) {
      try {
        await channel.unsubscribe();
        this.logger.debug(`✅ Unsubscribed from ${key}`);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `❌ Error unsubscribing from ${key}: ${errorMessage}`,
        );
      }
    }

    this.activeChannels.clear();
    this.activeSessions.clear();
    this.logger.log('✅ RealtimeService cleaned up');
  }

  /**
   * Ottieni statistiche in tempo reale
   */
  getRealtimeStats(): Record<string, any> {
    const stats: Record<string, any> = {
      activeChannels: this.activeChannels.size,
      activeSessions: this.activeSessions.size,
      readersByManga: {},
    };

    // Raccogli lettori per manga
    for (const [key, channel] of this.activeChannels) {
      if (key.includes(':presence')) {
        const parts = key.split(':');
        if (parts.length >= 2) {
          const mangaId = parts[1];
          const presence = channel.presenceState() as PresenceState;
          // Cast sicuro per evitare no-unsafe-member-access
          const readerCount = Object.keys(presence || {}).length;
          stats.readersByManga[mangaId] = readerCount;
        }
      }
    }

    return stats;
  }
}
