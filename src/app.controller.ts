import {
  Controller,
  Get,
  Post,
  Body,
  Redirect,
  Logger,
  HttpException,
  HttpStatus,
  Headers,
  Param,
  Query,
} from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service';

// Interfacce per i tipi di ritorno
interface TrackEventResponse {
  status: 'tracked' | 'error';
  message?: string;
}

interface TopPerformingItem {
  total_views: number;
  manga: {
    id: number;
    titolo: string;
    immagine: string | null;
  } | null;
}

interface QuickStats {
  total_manga: number;
  total_artists: number;
  total_tags: number;
}

// Interfaccia per gli item di analytics_events
interface AnalyticsEvent {
  manga_id: number;
  event_type: string;
}

// Interfacce per dashboard analytics
interface TagDistribution {
  nome: string;
  count: number;
}

interface ArtistDistribution {
  nome: string;
  count: number;
}

interface DashboardResponse {
  trending: TopPerformingItem[];
  tagDistribution: TagDistribution[];
  artistDistribution: ArtistDistribution[];
  totalViews: number;
  uniqueWallets: number;
  dailyStats: any[];
}

interface TrackEventPayload {
  type: string;
  mangaId?: number;
  wallet?: string;
  value?: number;
}

// Tipi per le risposte Supabase
interface RawTagData {
  tag_id: number;
  tags: {
    nome: string;
  } | null;
}

interface RawArtistData {
  artista_id: number;
  artisti: {
    nome: string;
  } | null;
}

interface ViewEvent {
  manga_id: number;
  created_at: string;
  wallet_address: string | null;
}

interface StartReadingSessionBody {
  mangaId: number;
  wallet?: string;
}

interface TrackPageBody {
  sessionId: number;
  page: number;
  mangaId: number;
}

interface VoteBody {
  mangaId: number;
  vote: 'up' | 'down';
  wallet: string;
}

// NUOVE INTERFACCE PER IL MODULO READER
interface VoteStatusResponse {
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
}

interface ReadingProgressBody {
  wallet: string;
  page: number;
  totalPages: number;
}

interface ReadingProgressResponse {
  mangaId: number;
  currentPage: number;
  totalPages: number;
  progress: number;
  lastRead: Date;
}

// Interfacce per le risposte tipizzate
interface VoteRecord {
  id: number;
  vote_type: string;
  user_wallet: string;
  manga_id: number;
}

interface MangaVoteRecord {
  up_votes: number;
  down_votes: number;
}

interface BookmarkRecord {
  id: number;
  last_page: number;
  updated_at: string;
}

// Interfacce per analytics
interface EventStats {
  views: number;
  clicks: number;
  vote_up: number;
  vote_down: number;
  other: number;
}

interface TrendStats {
  views: number;
  clicks: number;
  vote_up: number;
  vote_down: number;
}

interface RealtimeStats {
  topManga: any[];
  activeNow: number;
  viewsToday: number;
  timestamp: string;
}

interface DashboardV2Response {
  eventStats: EventStats;
  trends: TrendStats;
  realtime: RealtimeStats;
  hourly: number[];
  dailyStats: any[];
  timestamp: string;
}

// Interfaccia per summary (index.html)
interface AnalyticsSummary {
  total_manga: number;
  total_artists: number;
  total_tags: number;
  views_today: number;
  active_now: number;
  trending: TopPerformingItem[];
}

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ============================================
  // ENDPOINT BASE
  // ============================================

  @Get()
  @Redirect('/index.html', 302)
  getHello(): void {}

  @Get('api/status')
  getStatus(): { status: string; timestamp: string } {
    return {
      status: 'online',
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================
  // TRACKING ENDPOINTS
  // ============================================

  @Post('api/track')
  async trackEvent(
    @Body() body: TrackEventPayload,
  ): Promise<TrackEventResponse> {
    if (!body.type) {
      throw new HttpException('event type is required', HttpStatus.BAD_REQUEST);
    }

    const client = this.supabaseService.supabase;

    try {
      const { error } = await client.from('analytics_events').insert({
        manga_id: body.mangaId || null,
        event_type: body.type,
        wallet_address: body.wallet || 'guest',
        user_agent: null,
        path: null,
        created_at: new Date().toISOString(),
      });

      if (error) {
        this.logger.error(`Tracking Error: ${error.message}`);
        return { status: 'error', message: error.message };
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        await client.rpc('increment_daily_stats', {
          p_date: today,
          p_type: body.type,
        });
      } catch {
        this.logger.debug('RPC not available, skipping daily stats');
      }

      return { status: 'tracked' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Tracking Exception: ${errorMessage}`);
      return { status: 'error', message: errorMessage };
    }
  }

  @Post('api/vote')
  async trackVote(
    @Body() body: { manga_id: number; vote: 'up' | 'down'; wallet?: string },
  ): Promise<TrackEventResponse> {
    if (!body.manga_id || !body.vote) {
      throw new HttpException(
        'manga_id and vote are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const client = this.supabaseService.supabase;

    try {
      const { error } = await client.from('analytics_events').insert({
        manga_id: body.manga_id,
        event_type: `vote_${body.vote}`,
        wallet_address: body.wallet || 'guest',
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      return { status: 'tracked' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Vote Tracking Error: ${errorMessage}`);
      return { status: 'error', message: errorMessage };
    }
  }

  // ============================================
  // STATS ENDPOINTS (PER INDEX.HTML)
  // ============================================

  @Get('api/stats/quick')
  async getQuickStats(): Promise<QuickStats> {
    const client = this.supabaseService.supabase;

    try {
      const [mangaRes, artistiRes, tagsRes] = await Promise.all([
        client.from('manga').select('*', { count: 'exact', head: true }),
        client.from('artisti').select('*', { count: 'exact', head: true }),
        client.from('tags').select('*', { count: 'exact', head: true }),
      ]);

      return {
        total_manga: mangaRes.count || 0,
        total_artists: artistiRes.count || 0,
        total_tags: tagsRes.count || 0,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Errore recupero statistiche rapide: ${errorMessage}`);
      return {
        total_manga: 0,
        total_artists: 0,
        total_tags: 0,
      };
    }
  }

  @Get('api/analytics/realtime')
  async getRealtimeStats(): Promise<RealtimeStats> {
    const client = this.supabaseService.supabase;

    try {
      const { data: topManga } = await client
        .from('vw_top_manga')
        .select('*')
        .limit(5);

      const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
      const { count: activeNow } = await client
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fifteenMinAgo);

      const today = new Date().toISOString().split('T')[0];
      const { count: viewsToday } = await client
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'view')
        .gte('created_at', today);

      return {
        topManga: topManga || [],
        activeNow: activeNow || 0,
        viewsToday: viewsToday || 0,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      this.logger.error(`Realtime Stats Error: ${err}`);
      return {
        topManga: [],
        activeNow: 0,
        viewsToday: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('api/analytics/trends')
  async getTrends(): Promise<TrendStats> {
    const client = this.supabaseService.supabase;

    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split('T')[0];

      const { data: todayData } = await client
        .from('daily_stats')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      const { data: yesterdayData } = await client
        .from('daily_stats')
        .select('*')
        .eq('date', yesterday)
        .maybeSingle();

      const calculateTrend = (today: number, yesterday: number) => {
        if (!yesterday || yesterday === 0) return 0;
        return Math.round(((today - yesterday) / yesterday) * 100);
      };
      return {
        views: calculateTrend(
          todayData?.total_visits || 0,
          yesterdayData?.total_visits || 0,
        ),
        clicks: calculateTrend(
          todayData?.total_clicks || 0,
          yesterdayData?.total_clicks || 0,
        ),
        vote_up: 0,
        vote_down: 0
      };
    } catch (err) {
      this.logger.error(`Trends Error: ${err}`);
      return { views: 0, clicks: 0, vote_up: 0, vote_down: 0 };
    }
  }

  @Get('api/analytics/top-performing')
  async getTopPerforming(): Promise<TopPerformingItem[]> {
    const client = this.supabaseService.supabase;

    try {
      const { data, error } = await client
        .from('analytics_events')
        .select('manga_id, event_type')
        .eq('event_type', 'view')
        .not('manga_id', 'is', null);

      if (error) {
        this.logger.error(`Fetch Analytics Error: ${error.message}`);
        return [];
      }

      const viewsMap = new Map<number, number>();
      if (data) {
        (data as AnalyticsEvent[]).forEach((item) => {
          const mangaId = item.manga_id;
          viewsMap.set(mangaId, (viewsMap.get(mangaId) || 0) + 1);
        });
      }

      if (viewsMap.size === 0) return [];

      const mangaIds = Array.from(viewsMap.keys());
      const { data: mangaData, error: mangaError } = await client
        .from('manga')
        .select('id, titolo, immagine')
        .in('id', mangaIds);

      if (mangaError) {
        this.logger.error(`Fetch Manga Error: ${mangaError.message}`);
        return [];
      }

      const result: TopPerformingItem[] = Array.from(viewsMap.entries())
        .map(([id, count]) => ({
          total_views: count,
          manga: mangaData?.find((m) => m.id === id) || null,
        }))
        .sort((a, b) => b.total_views - a.total_views)
        .slice(0, 5);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Top Performing Error: ${errorMessage}`);
      return [];
    }
  }

  @Get('api/analytics/summary')
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    try {
      const [stats, realtime, topPerforming] = await Promise.all([
        this.getQuickStats().catch(() => null),
        this.getRealtimeStats().catch(() => null),
        this.getTopPerforming().catch(() => [])
      ]);

      return {
        total_manga: stats?.total_manga || 0,
        total_artists: stats?.total_artists || 0,
        total_tags: stats?.total_tags || 0,
        views_today: realtime?.viewsToday || 0,
        active_now: realtime?.activeNow || 0,
        trending: topPerforming.slice(0, 1), // Solo il primo per la strip
      };
    } catch (err) {
      this.logger.error(`Summary Error: ${err}`);
      return {
        total_manga: 0,
        total_artists: 0,
        total_tags: 0,
        views_today: 0,
        active_now: 0,
        trending: [],
      };
    }
  }

  // ============================================
  // ANALYTICS DASHBOARD (PER ANALYTICS.HTML)
  // ============================================

  @Get('api/analytics/dashboard')
  async getAnalyticsDashboard(): Promise<DashboardResponse> {
    const client = this.supabaseService.supabase;

    try {
      const { data: viewEvents } = await client
        .from('analytics_events')
        .select('manga_id, created_at, wallet_address')
        .eq('event_type', 'view')
        .not('manga_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      const viewsMap = new Map<number, number>();
      const walletsSet = new Set<string>();

      if (viewEvents) {
        (viewEvents as ViewEvent[]).forEach((item) => {
          const mangaId = item.manga_id;
          viewsMap.set(mangaId, (viewsMap.get(mangaId) || 0) + 1);
          if (item.wallet_address && item.wallet_address !== 'guest') {
            walletsSet.add(item.wallet_address);
          }
        });
      }

      const trendingMangaIds = Array.from(viewsMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      let trending: TopPerformingItem[] = [];
      if (trendingMangaIds.length > 0) {
        const { data: mangaData } = await client
          .from('manga')
          .select('id, titolo, immagine')
          .in('id', trendingMangaIds);

        trending = trendingMangaIds.map((id) => ({
          total_views: viewsMap.get(id) || 0,
          manga: mangaData?.find((m) => m.id === id) || null,
        }));
      }

      const { data: tagData } = await client
        .from('manga_tags')
        .select('tag_id, tags!inner(nome)');

      const tagCounts: Record<string, number> = {};
      if (tagData) {
        (tagData as unknown as RawTagData[]).forEach((item) => {
          if (item.tags?.nome) {
            const tagName = item.tags.nome;
            tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
          }
        });
      }

      const tagDistribution: TagDistribution[] = Object.entries(tagCounts)
        .map(([nome, count]) => ({ nome, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      const { data: artistData } = await client
        .from('manga')
        .select('artista_id, artisti!inner(nome)');

      const artistCounts: Record<string, number> = {};
      if (artistData) {
        (artistData as unknown as RawArtistData[]).forEach((item) => {
          if (item.artisti?.nome) {
            const artistName = item.artisti.nome;
            artistCounts[artistName] = (artistCounts[artistName] || 0) + 1;
          }
        });
      }

      const artistDistribution: ArtistDistribution[] = Object.entries(
        artistCounts,
      )
        .map(([nome, count]) => ({ nome, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const { data: dailyStats } = await client
        .from('daily_stats')
        .select('*')
        .order('date', { ascending: false })
        .limit(30);

      const { count: totalViews } = await client
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'view');

      return {
        trending,
        tagDistribution,
        artistDistribution,
        totalViews: totalViews || 0,
        uniqueWallets: walletsSet.size,
        dailyStats: dailyStats || [],
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Dashboard Analytics Error: ${errorMessage}`);
      return {
        trending: [],
        tagDistribution: [],
        artistDistribution: [],
        totalViews: 0,
        uniqueWallets: 0,
        dailyStats: [],
      };
    }
  }

  @Get('api/analytics/daily')
  async getDailyStats(@Query('days') days: number = 30): Promise<any[]> {
    const client = this.supabaseService.supabase;

    try {
      const { data, error } = await client
        .from('daily_stats')
        .select('*')
        .order('date', { ascending: false })
        .limit(days);

      if (error) throw error;
      return data || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Daily Stats Error: ${errorMessage}`);
      return [];
    }
  }

  @Get('api/analytics/events')
  async getEventStats(): Promise<EventStats> {
    const client = this.supabaseService.supabase;

    try {
      const stats = {
        views: 0,
        clicks: 0,
        vote_up: 0,
        vote_down: 0,
        other: 0,
      };

      const { data: events } = await client
        .from('analytics_events')
        .select('event_type');

      events?.forEach((e: any) => {
        if (e.event_type === 'view') stats.views++;
        else if (e.event_type === 'click') stats.clicks++;
        else if (e.event_type === 'vote_up') stats.vote_up++;
        else if (e.event_type === 'vote_down') stats.vote_down++;
        else stats.other++;
      });

      return stats;
    } catch (err) {
      this.logger.error(`Event Stats Error: ${err}`);
      return { views: 0, clicks: 0, vote_up: 0, vote_down: 0, other: 0 };
    }
  }

  @Get('api/analytics/hourly')
  async getHourlyStats(): Promise<number[]> {
    const client = this.supabaseService.supabase;

    try {
      const hourlyData = new Array(24).fill(0);

      const dayAgo = new Date(Date.now() - 24 * 60 * 60000).toISOString();
      const { data } = await client
        .from('analytics_events')
        .select('created_at')
        .gte('created_at', dayAgo);

      data?.forEach((item: any) => {
        const hour = new Date(item.created_at).getHours();
        hourlyData[hour]++;
      });

      return hourlyData;
    } catch (err) {
      this.logger.error(`Hourly Stats Error: ${err}`);
      return new Array(24).fill(0);
    }
  }

  @Get('api/analytics/dashboard/v2')
  async getDashboardV2(): Promise<DashboardV2Response> {
    try {
      const [eventStats, trends, realtime, hourly, daily] = await Promise.all([
        this.getEventStats(),
        this.getTrends(),
        this.getRealtimeStats(),
        this.getHourlyStats(),
        this.getDailyStats(7),
      ]);

      return {
        eventStats,
        trends,
        realtime,
        hourly,
        dailyStats: daily,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error(`Dashboard V2 Error: ${err}`);
      return this.getFallbackDashboard();
    }
  }

  // ============================================
  // READING SESSION ENDPOINTS
  // ============================================

  @Post('api/reading/start')
  async startReadingSession(
    @Body() body: StartReadingSessionBody,
    @Headers('user-agent') userAgent: string,
  ): Promise<{ sessionId: number }> {
    const client = this.supabaseService.supabase;

    const { data, error } = await client
      .from('reading_sessions')
      .insert({
        user_wallet: body.wallet || 'guest',
        manga_id: body.mangaId,
        start_time: new Date().toISOString(),
        device_type: this.parseDeviceType(userAgent),
      })
      .select('id')
      .single();

    if (error) throw error;

    const sessionData = data as { id: number };
    return { sessionId: sessionData.id };
  }

  @Post('api/reading/page')
  async trackPage(@Body() body: TrackPageBody): Promise<void> {
    const client = this.supabaseService.supabase;

    await client.rpc('update_reading_session', {
      p_session_id: body.sessionId,
      p_page: body.page,
    });

    await client.channel(`manga:${body.mangaId}:reading`).send({
      type: 'broadcast',
      event: 'page_turn',
      payload: { page: body.page, timestamp: new Date() },
    });
  }

  // ============================================
  // VOTE ENDPOINTS
  // ============================================

  @Post('api/vote-manga')
  async voteManga(@Body() body: VoteBody): Promise<{ success: boolean }> {
    const client = this.supabaseService.supabase;

    const { error } = await client.from('votes').upsert(
      {
        user_wallet: body.wallet,
        manga_id: body.mangaId,
        vote_type: body.vote,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_wallet, manga_id',
      },
    );

    if (error) throw error;

    await this.updateVoteCount(body.mangaId);

    return { success: true };
  }

  // ============================================
  // READER ENDPOINTS
  // ============================================

  @Get('reader/manga/:id/votes')
  async getVoteStatus(
    @Param('id') id: string,
    @Headers('x-wallet') wallet?: string,
  ): Promise<VoteStatusResponse> {
    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    const client = this.supabaseService.supabase;

    try {
      const { data: manga } = await client
        .from('manga')
        .select('up_votes, down_votes')
        .eq('id', mangaId)
        .single();

      const mangaData = manga as MangaVoteRecord | null;

      let userVote: 'up' | 'down' | null = null;

      if (wallet) {
        const { data: vote } = await client
          .from('votes')
          .select('vote_type')
          .eq('manga_id', mangaId)
          .eq('user_wallet', wallet.toLowerCase())
          .maybeSingle();

        if (vote) {
          const voteData = vote as { vote_type: string };
          if (voteData.vote_type === 'up' || voteData.vote_type === 'down') {
            userVote = voteData.vote_type;
          }
        }
      }

      return {
        upvotes: mangaData?.up_votes || 0,
        downvotes: mangaData?.down_votes || 0,
        userVote,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting vote status: ${errorMessage}`);
      return { upvotes: 0, downvotes: 0, userVote: null };
    }
  }

  @Post('reader/manga/:id/vote')
  async voteMangaReader(
    @Param('id') id: string,
    @Body() body: { voteType: 'up' | 'down'; wallet: string },
  ): Promise<VoteStatusResponse> {
    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    if (!body.wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = body.wallet.toLowerCase();

    try {
      const { data: existingVote } = await client
        .from('votes')
        .select('*')
        .eq('manga_id', mangaId)
        .eq('user_wallet', normalizedWallet)
        .maybeSingle();

      const existingVoteData = existingVote as VoteRecord | null;

      if (!existingVoteData) {
        await client.from('votes').insert({
          user_wallet: normalizedWallet,
          manga_id: mangaId,
          vote_type: body.voteType,
        });

        const incrementField = body.voteType === 'up' ? 'up_votes' : 'down_votes';
        await client
          .from('manga')
          .update({ [incrementField]: client.rpc('increment', { amount: 1 }) })
          .eq('id', mangaId);
      } else if (existingVoteData.vote_type !== body.voteType) {
        await client
          .from('votes')
          .update({
            vote_type: body.voteType,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingVoteData.id);

        if (existingVoteData.vote_type === 'up' && body.voteType === 'down') {
          await client
            .from('manga')
            .update({
              up_votes: client.rpc('decrement', { amount: 1 }),
              down_votes: client.rpc('increment', { amount: 1 }),
            })
            .eq('id', mangaId);
        } else if (
          existingVoteData.vote_type === 'down' &&
          body.voteType === 'up'
        ) {
          await client
            .from('manga')
            .update({
              up_votes: client.rpc('increment', { amount: 1 }),
              down_votes: client.rpc('decrement', { amount: 1 }),
            })
            .eq('id', mangaId);
        }
      } else {
        await client.from('votes').delete().eq('id', existingVoteData.id);

        const decrementField = body.voteType === 'up' ? 'up_votes' : 'down_votes';
        await client
          .from('manga')
          .update({ [decrementField]: client.rpc('decrement', { amount: 1 }) })
          .eq('id', mangaId);
      }

      await this.trackEvent({
        type: `vote_${body.voteType}`,
        mangaId,
        wallet: normalizedWallet,
      });

      return this.getVoteStatus(id, normalizedWallet);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error voting: ${errorMessage}`);
      throw new HttpException(
        'Errore durante il voto',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('reader/manga/:id/progress')
  async saveReadingProgress(
    @Param('id') id: string,
    @Body() body: ReadingProgressBody,
  ): Promise<ReadingProgressResponse> {
    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    if (!body.wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = body.wallet.toLowerCase();
    const progress = Math.min(
      100,
      Math.round((body.page / body.totalPages) * 100),
    );

    try {
      const { data: existing } = await client
        .from('bookmarks')
        .select('id')
        .eq('user_wallet', normalizedWallet)
        .eq('manga_id', mangaId)
        .maybeSingle();

      const now = new Date().toISOString();

      if (existing) {
        const existingData = existing as { id: number };
        await client
          .from('bookmarks')
          .update({
            last_page: body.page,
            updated_at: now,
            status: progress === 100 ? 'completed' : 'reading',
          })
          .eq('id', existingData.id);
      } else {
        await client.from('bookmarks').insert({
          user_wallet: normalizedWallet,
          manga_id: mangaId,
          last_page: body.page,
          status: progress === 100 ? 'completed' : 'reading',
        });
      }

      return {
        mangaId,
        currentPage: body.page,
        totalPages: body.totalPages,
        progress,
        lastRead: new Date(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error saving progress: ${errorMessage}`);
      throw new HttpException(
        'Errore durante il salvataggio',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('reader/manga/:id/progress')
  async getReadingProgress(
    @Param('id') id: string,
    @Headers('x-wallet') wallet: string,
  ): Promise<ReadingProgressResponse | null> {
    const mangaId = parseInt(id, 10);
    if (isNaN(mangaId)) {
      throw new HttpException('ID non valido', HttpStatus.BAD_REQUEST);
    }

    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      const { data: bookmark } = await client
        .from('bookmarks')
        .select('last_page, updated_at')
        .eq('user_wallet', normalizedWallet)
        .eq('manga_id', mangaId)
        .maybeSingle();

      if (!bookmark) {
        return null;
      }

      const bookmarkData = bookmark as BookmarkRecord;

      const { data: manga } = await client
        .from('manga')
        .select('numero_pagine')
        .eq('id', mangaId)
        .single();

      const mangaData = manga as { numero_pagine: number | null } | null;
      const totalPages = mangaData?.numero_pagine || 1;
      const progress = Math.min(
        100,
        Math.round((bookmarkData.last_page / totalPages) * 100),
      );

      return {
        mangaId,
        currentPage: bookmarkData.last_page,
        totalPages,
        progress,
        lastRead: new Date(bookmarkData.updated_at),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting progress: ${errorMessage}`);
      return null;
    }
  }

  @Get('reader/bookmarks')
  async getUserBookmarks(@Headers('x-wallet') wallet: string): Promise<any[]> {
    if (!wallet) {
      throw new HttpException('Wallet richiesto', HttpStatus.UNAUTHORIZED);
    }

    const client = this.supabaseService.supabase;
    const normalizedWallet = wallet.toLowerCase();

    try {
      const { data } = await client
        .from('bookmarks')
        .select(
          `
          id,
          last_page,
          status,
          added_at,
          updated_at,
          manga!bookmarks_manga_id_fkey (
            id,
            titolo,
            immagine,
            numero_pagine,
            up_votes,
            down_votes
          )
        `,
        )
        .eq('user_wallet', normalizedWallet)
        .order('updated_at', { ascending: false });

      return data || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error getting bookmarks: ${errorMessage}`);
      return [];
    }
  }

  // ============================================
  // METODI DI UTILITY
  // ============================================

  private parseDeviceType(userAgent: string): string {
    if (!userAgent) return 'unknown';
    if (userAgent.includes('Mobile')) return 'mobile';
    if (userAgent.includes('Tablet')) return 'tablet';
    return 'desktop';
  }

  private async updateVoteCount(mangaId: number): Promise<void> {
    const client = this.supabaseService.supabase;

    try {
      const { data: votes } = await client
        .from('votes')
        .select('vote_type')
        .eq('manga_id', mangaId);

      const votesData = votes as { vote_type: string }[] | null;
      const upVotes = votesData?.filter((v) => v.vote_type === 'up').length || 0;
      const downVotes = votesData?.filter((v) => v.vote_type === 'down').length || 0;

      await client
        .from('manga')
        .update({
          up_votes: upVotes,
          down_votes: downVotes,
        })
        .eq('id', mangaId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Error updating vote count: ${errorMessage}`);
    }
  }

  private getFallbackDashboard(): DashboardV2Response {
    return {
      eventStats: { views: 0, clicks: 0, vote_up: 0, vote_down: 0, other: 0 },
      trends: { views: 0, clicks: 0, vote_up: 0, vote_down: 0 },
      realtime: {
        topManga: [],
        activeNow: 0,
        viewsToday: 0,
        timestamp: new Date().toISOString(),
      },
      hourly: new Array(24).fill(0),
      dailyStats: [],
      timestamp: new Date().toISOString(),
    };
  }
}
