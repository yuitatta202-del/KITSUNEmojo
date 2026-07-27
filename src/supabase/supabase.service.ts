import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cache } from '@nestjs/cache-manager';

// ============================================
// ENUM E COSTANTI
// ============================================

export enum TableName {
  ADMIN_USERS = 'admin_users',
  ANALYTICS_EVENTS = 'analytics_events',
  ARTISTI = 'artisti',
  BOOKMARKS = 'bookmarks',
  CATEGORIE = 'categorie',
  CHARACTERS = 'characters',
  COMMENTS = 'comments',
  COMMENT_MENTIONS = 'comment_mentions',
  COMMENT_VOTES = 'comment_votes',
  DAILY_STATS = 'daily_stats',
  GRUPPI = 'gruppi',
  MANGA = 'manga',
  MANGA_CHARACTERS = 'manga_characters',
  MANGA_DAILY_STATS = 'manga_daily_stats',
  MANGA_GRUPPI = 'manga_gruppi',
  MANGA_PARODIES = 'manga_parodies',
  MANGA_TAGS = 'manga_tags',
  PARODIES = 'parodies',
  READING_SESSIONS = 'reading_sessions',
  TAGS = 'tags',
  USERS = 'users',
  VOTES = 'votes',
}

export enum EventType {
  VIEW = 'view',
  CLICK = 'click',
  VOTE_UP = 'vote_up',
  VOTE_DOWN = 'vote_down',
  BOOKMARK_ADD = 'bookmark_add',
  BOOKMARK_REMOVE = 'bookmark_remove',
  COMMENT_ADD = 'comment_add',
  READING_START = 'reading_start',
  READING_COMPLETE = 'reading_complete',
}

export enum VoteType {
  UP = 'up',
  DOWN = 'down',
}

export enum BookmarkStatus {
  READING = 'reading',
  COMPLETED = 'completed',
  DROPPED = 'dropped',
  PLAN_TO_READ = 'plan_to_read',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  EDITOR = 'editor',
}

// ============================================
// TIPI DAL DATABASE (CON TUTTE LE TABELLE)
// ============================================

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// Tipi specifici - ORA CON TUTTE LE TABELLE!
export type AdminUser = Tables<'admin_users'>;
export type AnalyticsEvent = Tables<'analytics_events'>;
export type Artista = Tables<'artisti'>;
export type Bookmark = Tables<'bookmarks'>;
export type Categoria = Tables<'categorie'>;
export type Character = Tables<'characters'>;
export type Comment = Tables<'comments'>;
export type CommentMention = Tables<'comment_mentions'>;
export type CommentVote = Tables<'comment_votes'>;
export type DailyStat = Tables<'daily_stats'>;
export type Gruppo = Tables<'gruppi'>;
export type Manga = Tables<'manga'>;
export type MangaCharacter = Tables<'manga_characters'>;
export type MangaDailyStat = Tables<'manga_daily_stats'>;
export type MangaGruppo = Tables<'manga_gruppi'>;
export type MangaParody = Tables<'manga_parodies'>;
export type MangaTag = Tables<'manga_tags'>;
export type Parody = Tables<'parodies'>;
export type ReadingSession = Tables<'reading_sessions'>;
export type Tag = Tables<'tags'>;
export type User = Tables<'users'>;
export type Vote = Tables<'votes'>;

// Tipi per insert/update - ORA CON TUTTE LE TABELLE!
export type AdminUserInsert = InsertTables<'admin_users'>;
export type AdminUserUpdate = UpdateTables<'admin_users'>;
export type AnalyticsEventInsert = InsertTables<'analytics_events'>;
export type AnalyticsEventUpdate = UpdateTables<'analytics_events'>;
export type ArtistaInsert = InsertTables<'artisti'>;
export type ArtistaUpdate = UpdateTables<'artisti'>;
export type BookmarkInsert = InsertTables<'bookmarks'>;
export type BookmarkUpdate = UpdateTables<'bookmarks'>;
export type CategoriaInsert = InsertTables<'categorie'>;
export type CategoriaUpdate = UpdateTables<'categorie'>;
export type CharacterInsert = InsertTables<'characters'>;
export type CharacterUpdate = UpdateTables<'characters'>;
export type CommentInsert = InsertTables<'comments'>;
export type CommentUpdate = UpdateTables<'comments'>;
export type CommentMentionInsert = InsertTables<'comment_mentions'>;
export type CommentMentionUpdate = UpdateTables<'comment_mentions'>;
export type CommentVoteInsert = InsertTables<'comment_votes'>;
export type CommentVoteUpdate = UpdateTables<'comment_votes'>;
export type DailyStatInsert = InsertTables<'daily_stats'>;
export type DailyStatUpdate = UpdateTables<'daily_stats'>;
export type GruppoInsert = InsertTables<'gruppi'>;
export type GruppoUpdate = UpdateTables<'gruppi'>;
export type MangaInsert = InsertTables<'manga'>;
export type MangaUpdate = UpdateTables<'manga'>;
export type MangaCharacterInsert = InsertTables<'manga_characters'>;
export type MangaCharacterUpdate = UpdateTables<'manga_characters'>;
export type MangaDailyStatInsert = InsertTables<'manga_daily_stats'>;
export type MangaDailyStatUpdate = UpdateTables<'manga_daily_stats'>;
export type MangaGruppoInsert = InsertTables<'manga_gruppi'>;
export type MangaGruppoUpdate = UpdateTables<'manga_gruppi'>;
export type MangaParodyInsert = InsertTables<'manga_parodies'>;
export type MangaParodyUpdate = UpdateTables<'manga_parodies'>;
export type MangaTagInsert = InsertTables<'manga_tags'>;
export type MangaTagUpdate = UpdateTables<'manga_tags'>;
export type ParodyInsert = InsertTables<'parodies'>;
export type ParodyUpdate = UpdateTables<'parodies'>;
export type ReadingSessionInsert = InsertTables<'reading_sessions'>;
export type ReadingSessionUpdate = UpdateTables<'reading_sessions'>;
export type TagInsert = InsertTables<'tags'>;
export type TagUpdate = UpdateTables<'tags'>;
export type UserInsert = InsertTables<'users'>;
export type UserUpdate = UpdateTables<'users'>;
export type VoteInsert = InsertTables<'votes'>;
export type VoteUpdate = UpdateTables<'votes'>;

// ============================================
// INTERFACCE DI SUPPORTO
// ============================================

export interface MangaWithRelations extends Manga {
  artisti?: Artista | null;
  categorie?: Categoria | null;
  tags?: Tag[];
  gruppi?: Gruppo[];
  characters?: Character[];
  parodies?: Parody[];
}

export interface MangaFilterOptions {
  visible?: boolean;
  artista_id?: number | null;
  categoria_id?: number | null;
  tag_id?: number;
  search?: string;
  orderBy?: keyof Manga;
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface UpdateResult<T = any> {
  success: boolean;
  data?: T;
  error?: any;
  code?: string; // ✅ Aggiunto
  message?: string; // ✅ Aggiunto
}

export interface MangaStats {
  id: number;
  titolo: string;
  total_views: number;
  total_votes: number;
  up_votes: number;
  down_votes: number;
  total_bookmarks: number;
  total_comments: number;
  total_reading_sessions: number;
  avg_completion_rate: number;
  daily_stats: {
    date: string;
    views: number;
    unique_readers: number;
    completions: number;
  }[];
}

export interface GoogleUser {
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  accessToken: string;
  refreshToken?: string;
  provider: string;
  providerId: string;
}

export interface TopMangaView {
  id: number;
  titolo: string;
  immagine: string | null;
  total_views: number;
  period: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  latency: number;
  tables: Record<string, boolean>;
}

// Interfacce per le join
export interface MangaTagJoin {
  tag_id: number;
  tags: Tag;
}

export interface MangaGruppoJoin {
  gruppo_id: number;
  gruppi: Gruppo;
}

export interface MangaCharacterJoin {
  character_id: number;
  characters: Character;
}

export interface MangaParodyJoin {
  parody_id: number;
  parodies: Parody;
}

export interface ReadingSessionWithManga extends ReadingSession {
  manga: Manga;
}

export interface BookmarkWithManga extends Bookmark {
  manga: Manga;
}

export interface ReadingSessionData {
  completion_rate: number | null;
}

export interface MangaTagId {
  manga_id: number;
}

export interface RelatedMangaData {
  manga_id: number;
  manga: Manga;
}

export interface VoteData {
  vote_type: string;
}

export interface EventData {
  event_type: string;
}

export interface BookmarkId {
  id: number;
}

// ============================================
// SERVICE PRINCIPALE - VERSIONE CARROARMATO
// ============================================

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  public supabase!: SupabaseClient<Database>;
  private readonly CACHE_TTL = {
    manga: 300000,
    artist: 300000,
    tag: 300000,
    category: 300000,
    stats: 60000,
    user: 300000,
    admin: 60000,
  };
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private readonly MAX_RETRIES = 5;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    @Inject('CACHE_MANAGER') private cacheManager: Cache,
  ) {
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
      const supabaseKey = this.configService.get<string>(
        'SUPABASE_SERVICE_ROLE_KEY',
      );

      this.logger.log('🔄 Inizializzazione Supabase...');
      this.logger.log(
        `📌 SUPABASE_URL: ${supabaseUrl ? '✅ Presente' : '❌ Mancante'}`,
      );
      this.logger.log(
        `📌 SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? '✅ Presente' : '❌ Mancante'}`,
      );

      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          'Credenziali Supabase mancanti. Controlla il file .env',
        );
      }

      this.logger.log(
        `🔑 KEY (primi 10 char): ${supabaseKey.substring(0, 10)}...`,
      );

      this.supabase = createClient<Database>(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            'x-application-name': 'kitsune-mojo',
          },
        },
      });

      this.isConnected = true;
      this.connectionAttempts = 0;
      this.logger.log('✅ Client Supabase creato con successo');

      this.eventEmitter.emit('supabase.connected', {
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const error = err as Error;
      this.isConnected = false;
      this.connectionAttempts++;

      this.logger.error(
        `❌ Errore inizializzazione Supabase (tentativo ${this.connectionAttempts}):`,
        error.message,
      );

      if (this.connectionAttempts < this.MAX_RETRIES) {
        this.logger.log(`🔄 Nuovo tentativo tra 5 secondi...`);
        setTimeout(() => this.initializeClient(), 5000);
      } else {
        this.logger.error(
          `❌ Impossibile connettersi a Supabase dopo ${this.MAX_RETRIES} tentativi`,
        );
        this.eventEmitter.emit('supabase.error', {
          error: error.message,
          attempts: this.connectionAttempts,
          timestamp: new Date().toISOString(),
        });
      }

      throw err;
    }
  }

  // ============================================
  // METODI PRIVATI DI SUPPORTO
  // ============================================

  private async withCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttl: number = 300000,
  ): Promise<T> {
    const cached = await this.cacheManager.get<T>(key);
    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
      return cached;
    }

    this.logger.debug(`Cache MISS: ${key}`);
    const result = await operation();
    await this.cacheManager.set(key, result, ttl);
    return result;
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      context?: string;
    } = {},
  ): Promise<T> {
    const { maxRetries = 3, retryDelay = 1000, context = 'unknown' } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        this.logger.warn(
          `[${context}] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
        );

        if (attempt === maxRetries) break;

        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  private async invalidateCache(patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      await this.cacheManager.del(pattern);
    }
    this.logger.debug(
      `🧹 Cache invalidated for patterns: ${patterns.join(', ')}`,
    );
  }

  private checkConnection(): void {
    if (!this.isConnected || !this.supabase) {
      throw new InternalServerErrorException('Supabase client not initialized');
    }
  }

  private handleError(error: any, context: string): never {
    const errorMessage = error?.message || 'Unknown error';
    const errorCode = error?.code || 'UNKNOWN';

    this.logger.error(`[${context}] Error: ${errorMessage} (${errorCode})`);

    this.eventEmitter.emit('supabase.error', {
      context,
      error: errorMessage,
      code: errorCode,
      timestamp: new Date().toISOString(),
    });

    if (errorCode === 'PGRST116') {
      throw new NotFoundException('Resource not found');
    }

    if (errorCode === '23505') {
      throw new BadRequestException('Duplicate entry');
    }

    if (errorCode === '23503') {
      throw new BadRequestException('Foreign key violation');
    }

    throw new InternalServerErrorException(`Database error: ${errorMessage}`);
  }

  private buildPaginatedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResult<T> {
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  // ============================================
  // TEST CONNESSIONE
  // ============================================

  async testConnection(): Promise<{
    success: boolean;
    message: string;
    count?: number;
    latency?: number;
  }> {
    const start = Date.now();

    try {
      this.checkConnection();

      const { error, count } = await this.supabase
        .from('manga')
        .select('*', { count: 'exact', head: true });

      const latency = Date.now() - start;

      if (error) {
        this.logger.error('❌ Test connessione fallito:', error.message);
        return { success: false, message: `Errore: ${error.message}`, latency };
      }

      this.logger.log(`✅ Connessione Supabase funzionante! (${latency}ms)`);

      this.eventEmitter.emit('supabase.connection.test', {
        success: true,
        latency,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: 'Connessione OK',
        count: count || 0,
        latency,
      };
    } catch (err) {
      const error = err as Error;
      const latency = Date.now() - start;

      this.logger.error('❌ Eccezione test connessione:', error.message);

      return {
        success: false,
        message: `Eccezione: ${error.message}`,
        latency,
      };
    }
  }

  // ============================================
  // METODI BASE (CRUD)
  // ============================================

  async getMangaById(id: number): Promise<Manga | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('manga')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        this.handleError(error, `getMangaById(${id})`);
      }

      return data;
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  async getAllManga(
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('manga')
        .select('*', { count: 'exact' })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getAllManga');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getAllManga');
    }
  }

  async getArtistById(id: number): Promise<Artista | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('artisti')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        this.handleError(error, `getArtistById(${id})`);
      }

      return data;
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  async getAllArtists(
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Artista>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('artisti')
        .select('*', { count: 'exact' })
        .order('nome')
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getAllArtists');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getAllArtists');
    }
  }

  async getTagById(id: number): Promise<Tag | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('tags')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        this.handleError(error, `getTagById(${id})`);
      }

      return data;
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  async getAllTags(
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Tag>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('tags')
        .select('*', { count: 'exact' })
        .order('nome')
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getAllTags');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getAllTags');
    }
  }

  async getAllCategories(
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Categoria>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('categorie')
        .select('*', { count: 'exact' })
        .order('nome')
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getAllCategories');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getAllCategories');
    }
  }

  async getMangaTags(mangaId: number): Promise<Tag[]> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('manga_tags')
        .select('tag_id, tags:tag_id(*)')
        .eq('manga_id', mangaId);

      if (error) {
        this.handleError(error, `getMangaTags(${mangaId})`);
      }

      const typedData = data as unknown as MangaTagJoin[];
      return (typedData || []).map((item) => item.tags).filter(Boolean);
    } catch (err) {
      this.handleError(err, `getMangaTags(${mangaId})`);
    }
  }

  // ============================================
  // METODI DI RELAZIONE
  // ============================================

  async getMangaGruppi(mangaId: number): Promise<Gruppo[]> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('manga_gruppi')
        .select('gruppo_id, gruppi:gruppo_id(*)')
        .eq('manga_id', mangaId);

      if (error) {
        this.handleError(error, `getMangaGruppi(${mangaId})`);
      }

      const typedData = data as unknown as MangaGruppoJoin[];
      return (typedData || []).map((item) => item.gruppi).filter(Boolean);
    } catch (err) {
      this.handleError(err, `getMangaGruppi(${mangaId})`);
    }
  }

  async getMangaCharacters(mangaId: number): Promise<Character[]> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('manga_characters')
        .select('character_id, characters:character_id(*)')
        .eq('manga_id', mangaId);

      if (error) {
        this.handleError(error, `getMangaCharacters(${mangaId})`);
      }

      const typedData = data as unknown as MangaCharacterJoin[];
      return (typedData || []).map((item) => item.characters).filter(Boolean);
    } catch (err) {
      this.handleError(err, `getMangaCharacters(${mangaId})`);
    }
  }

  async getMangaParodies(mangaId: number): Promise<Parody[]> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('manga_parodies')
        .select('parody_id, parodies:parody_id(*)')
        .eq('manga_id', mangaId);

      if (error) {
        this.handleError(error, `getMangaParodies(${mangaId})`);
      }

      const typedData = data as unknown as MangaParodyJoin[];
      return (typedData || []).map((item) => item.parodies).filter(Boolean);
    } catch (err) {
      this.handleError(err, `getMangaParodies(${mangaId})`);
    }
  }

  async getMangaBookmarks(mangaId: number): Promise<Bookmark[]> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('bookmarks')
        .select('*')
        .eq('manga_id', mangaId);

      if (error) {
        this.handleError(error, `getMangaBookmarks(${mangaId})`);
      }

      return data || [];
    } catch (err) {
      this.handleError(err, `getMangaBookmarks(${mangaId})`);
    }
  }

  async getMangaVotes(mangaId: number): Promise<Vote[]> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('votes')
        .select('*')
        .eq('manga_id', mangaId);

      if (error) {
        this.handleError(error, `getMangaVotes(${mangaId})`);
      }

      return data || [];
    } catch (err) {
      this.handleError(err, `getMangaVotes(${mangaId})`);
    }
  }

  async getMangaComments(mangaId: number): Promise<Comment[]> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('comments')
        .select('*')
        .eq('manga_id', mangaId)
        .is('parent_id', null);

      if (error) {
        this.handleError(error, `getMangaComments(${mangaId})`);
      }

      return data || [];
    } catch (err) {
      this.handleError(err, `getMangaComments(${mangaId})`);
    }
  }

  // ============================================
  // METODI COMPLESSI
  // ============================================

  async getMangaWithFilters(
    filters: MangaFilterOptions,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<MangaWithRelations>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      let query = this.supabase.from('manga').select(
        `
          *,
          artisti:artista_id (id, nome, counter),
          categorie:categoria_id (id, nome, counter)
        `,
        { count: 'exact' },
      );

      if (filters.visible !== undefined) {
        query = query.eq('visible', filters.visible);
      }

      if (filters.artista_id) {
        query = query.eq('artista_id', filters.artista_id);
      }

      if (filters.categoria_id) {
        query = query.eq('categoria_id', filters.categoria_id);
      }

      if (filters.search) {
        query = query.ilike('titolo', `%${filters.search}%`);
      }

      if (filters.tag_id) {
        const { data: mangaIds } = await this.supabase
          .from('manga_tags')
          .select('manga_id')
          .eq('tag_id', filters.tag_id);

        if (mangaIds && mangaIds.length > 0) {
          const typedMangaIds = mangaIds as MangaTagId[];
          query = query.in(
            'id',
            typedMangaIds.map((m) => m.manga_id),
          );
        } else {
          return this.buildPaginatedResponse([], 0, page, limit);
        }
      }

      if (filters.orderBy) {
        query = query.order(filters.orderBy, {
          ascending: filters.orderDirection === 'asc',
        });
      }

      const { data, error, count } = await query.range(
        offset,
        offset + limit - 1,
      );

      if (error) {
        this.handleError(error, 'getMangaWithFilters');
      }

      return this.buildPaginatedResponse(
        (data as MangaWithRelations[]) || [],
        count || 0,
        page,
        limit,
      );
    } catch (err) {
      this.handleError(err, 'getMangaWithFilters');
    }
  }

  async getMangaWithAllRelations(mangaId: number): Promise<{
    manga: Manga | null;
    artisti: Artista | null;
    categorie: Categoria | null;
    tags: Tag[];
    gruppi: Gruppo[];
    characters: Character[];
    parodies: Parody[];
    bookmarks: Bookmark[];
    votes: Vote[];
    comments: Comment[];
  }> {
    this.checkConnection();

    try {
      const manga = await this.getMangaById(mangaId);
      if (!manga) {
        return {
          manga: null,
          artisti: null,
          categorie: null,
          tags: [],
          gruppi: [],
          characters: [],
          parodies: [],
          bookmarks: [],
          votes: [],
          comments: [],
        };
      }

      const artisti = manga.artista_id
        ? await this.getArtistById(manga.artista_id)
        : null;

      let categorie: Categoria | null = null;
      if (manga.categoria_id) {
        const { data } = await this.supabase
          .from('categorie')
          .select('*')
          .eq('id', manga.categoria_id)
          .maybeSingle();
        categorie = data;
      }

      const [tags, gruppi, characters, parodies, bookmarks, votes, comments] =
        await Promise.all([
          this.getMangaTags(mangaId),
          this.getMangaGruppi(mangaId),
          this.getMangaCharacters(mangaId),
          this.getMangaParodies(mangaId),
          this.getMangaBookmarks(mangaId),
          this.getMangaVotes(mangaId),
          this.getMangaComments(mangaId),
        ]);

      return {
        manga,
        artisti,
        categorie,
        tags,
        gruppi,
        characters,
        parodies,
        bookmarks,
        votes,
        comments,
      };
    } catch (err) {
      this.handleError(err, `getMangaWithAllRelations(${mangaId})`);
    }
  }

  async getMangaStatistics(
    mangaId: number,
    days: number = 30,
  ): Promise<MangaStats | null> {
    this.checkConnection();

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [manga, views, votes, bookmarks, comments, sessions, dailyStats] =
        await Promise.all([
          this.getMangaById(mangaId),
          this.supabase
            .from('analytics_events')
            .select('*', { count: 'exact', head: true })
            .eq('manga_id', mangaId)
            .eq('event_type', 'view'),
          this.supabase
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('manga_id', mangaId),
          this.supabase
            .from('bookmarks')
            .select('*', { count: 'exact', head: true })
            .eq('manga_id', mangaId),
          this.supabase
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('manga_id', mangaId),
          this.supabase
            .from('reading_sessions')
            .select('completion_rate')
            .eq('manga_id', mangaId)
            .not('completion_rate', 'is', null),
          this.supabase
            .from('manga_daily_stats')
            .select('*')
            .eq('manga_id', mangaId)
            .gte('date', startDate.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0])
            .order('date', { ascending: false }),
        ]);

      if (!manga) return null;

      const sessionsData = (sessions.data as ReadingSessionData[]) || [];
      const avgCompletion =
        sessionsData.length > 0
          ? sessionsData.reduce(
              (acc: number, s: ReadingSessionData) =>
                acc + (s.completion_rate || 0),
              0,
            ) / sessionsData.length
          : 0;

      const dailyStatsData = (dailyStats.data as MangaDailyStat[]) || [];
      const transformedDailyStats = dailyStatsData.map((stat) => ({
        date: stat.date || '',
        views: stat.views || 0,
        unique_readers: stat.unique_readers || 0,
        completions: stat.completions || 0,
      }));

      return {
        id: mangaId,
        titolo: manga.titolo,
        total_views: views.count || 0,
        total_votes: votes.count || 0,
        up_votes: manga.up_votes || 0,
        down_votes: manga.down_votes || 0,
        total_bookmarks: bookmarks.count || 0,
        total_comments: comments.count || 0,
        total_reading_sessions: sessionsData.length,
        avg_completion_rate: avgCompletion,
        daily_stats: transformedDailyStats,
      };
    } catch (err) {
      this.handleError(err, `getMangaStatistics(${mangaId})`);
    }
  }

  // ============================================
  // OPERAZIONI DI SCRITTURA
  // ============================================

  async updateManga(
    mangaId: number,
    updateData: MangaUpdate,
  ): Promise<UpdateResult<Manga>> {
    this.checkConnection();

    try {
      if (!mangaId || mangaId <= 0 || isNaN(mangaId)) {
        throw new BadRequestException('Manga ID non valido');
      }

      if (!updateData || Object.keys(updateData).length === 0) {
        return {
          success: true,
          message: 'Nessun dato da aggiornare',
        };
      }

      const existingManga = await this.getMangaById(mangaId);
      if (!existingManga) {
        throw new NotFoundException(`Manga con ID ${mangaId} non trovato`);
      }

      const sanitizedData = this.sanitizeUpdateData(updateData);

      const result = await this.withRetry(
        async () => {
          const { data, error } = await this.supabase
            .from('manga')
            .update(sanitizedData as never)
            .eq('id', mangaId)
            .select()
            .single();

          if (error) {
            throw new Error(`Supabase update failed: ${error.message}`);
          }

          return data as Manga;
        },
        { maxRetries: 3, retryDelay: 500, context: `updateManga(${mangaId})` },
      );

      this.invalidateCache([
        `manga_${mangaId}`,
        `manga_relations_${mangaId}`,
        'manga_list_admin',
        'manga_list_public',
        'system-stats',
        'quick-stats',
      ]).catch((err) =>
        this.logger.warn(`Cache invalidation failed: ${err.message}`),
      );

      this.eventEmitter.emit('manga.updated', {
        mangaId,
        updates: Object.keys(sanitizedData),
        timestamp: new Date().toISOString(),
      });

      return { success: true, data: result };
    } catch (err) {
      const error = err as Error;

      if (err instanceof BadRequestException) {
        return { success: false, error: err.message, code: 'BAD_REQUEST' };
      }
      if (err instanceof NotFoundException) {
        return { success: false, error: err.message, code: 'NOT_FOUND' };
      }

      const errorObj = err as any;
      if (errorObj?.code === '23505') {
        return {
          success: false,
          error: 'Dati duplicati',
          code: 'DUPLICATE_ENTRY',
        };
      }
      if (errorObj?.code === '23503') {
        return {
          success: false,
          error: 'Riferimento non valido',
          code: 'FOREIGN_KEY_VIOLATION',
        };
      }

      return { success: false, error: error.message, code: 'INTERNAL_ERROR' };
    }
  }

  /**
   * ✅ Metodo helper per sanitizzare i dati di update
   */
  private sanitizeUpdateData(data: MangaUpdate): Record<string, any> {
    const sanitized: Record<string, any> = {};

    // Campi permessi
    const allowedFields: (keyof MangaUpdate)[] = [
      'titolo',
      'immagine',
      'lingua',
      'numero_pagine',
      'url_origine',
      'pagine',
      'visible',
      'artista_id',
      'categoria_id',
      'up_votes',
      'down_votes',
    ];

    for (const field of allowedFields) {
      const value = data[field];
      if (value !== undefined) {
        // ✅ Validazione specifica per campo
        if (field === 'titolo' && typeof value === 'string') {
          sanitized[field] = value.trim().slice(0, 255);
        } else if (field === 'immagine' && typeof value === 'string') {
          sanitized[field] = value.trim();
        } else if (field === 'numero_pagine' && typeof value === 'number') {
          sanitized[field] = Math.max(1, Math.round(value));
        } else if (field === 'artista_id' || field === 'categoria_id') {
          sanitized[field] = value === null ? null : Number(value);
        } else {
          sanitized[field] = value;
        }
      }
    }

    // ✅ Aggiungi timestamp di aggiornamento
    sanitized.updated_at = new Date().toISOString();

    return sanitized;
  }

  async softDeleteManga(mangaId: number): Promise<UpdateResult> {
    this.checkConnection();

    try {
      const { error } = await this.supabase
        .from('manga')
        .update({ visible: false } as never)
        .eq('id', mangaId);

      if (error) {
        this.handleError(error, `softDeleteManga(${mangaId})`);
      }

      await this.invalidateCache([`manga_${mangaId}`, 'manga_list']);

      this.eventEmitter.emit('manga.deleted', {
        mangaId,
        type: 'soft',
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async hardDeleteManga(mangaId: number): Promise<UpdateResult> {
    this.checkConnection();

    try {
      const { error } = await this.supabase
        .from('manga')
        .delete()
        .eq('id', mangaId);

      if (error) {
        this.handleError(error, `hardDeleteManga(${mangaId})`);
      }

      await this.invalidateCache([`manga_${mangaId}`, 'manga_list']);

      this.eventEmitter.emit('manga.deleted', {
        mangaId,
        type: 'hard',
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async restoreManga(mangaId: number): Promise<UpdateResult> {
    this.checkConnection();

    try {
      const { error } = await this.supabase
        .from('manga')
        .update({ visible: true } as never)
        .eq('id', mangaId);

      if (error) {
        this.handleError(error, `restoreManga(${mangaId})`);
      }

      await this.invalidateCache([`manga_${mangaId}`, 'manga_list']);

      this.eventEmitter.emit('manga.restored', {
        mangaId,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async addTagToManga(mangaId: number, tagId: number): Promise<UpdateResult> {
    this.checkConnection();

    try {
      const { error } = await this.supabase
        .from('manga_tags')
        .insert({ manga_id: mangaId, tag_id: tagId } as any);

      if (error) {
        if (error.code === '23505') {
          return { success: true };
        }
        this.handleError(error, `addTagToManga(${mangaId}, ${tagId})`);
      }

      await this.invalidateCache([`manga_tags_${mangaId}`]);

      this.eventEmitter.emit('manga.tag_added', {
        mangaId,
        tagId,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  async removeTagFromManga(
    mangaId: number,
    tagId: number,
  ): Promise<UpdateResult> {
    this.checkConnection();

    try {
      const { error } = await this.supabase
        .from('manga_tags')
        .delete()
        .eq('manga_id', mangaId)
        .eq('tag_id', tagId);

      if (error) {
        this.handleError(error, `removeTagFromManga(${mangaId}, ${tagId})`);
      }

      await this.invalidateCache([`manga_tags_${mangaId}`]);

      this.eventEmitter.emit('manga.tag_removed', {
        mangaId,
        tagId,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }

  // ============================================
  // TRACKING E STATISTICHE
  // ============================================

  async trackEvent(event: {
    mangaId?: number;
    eventType: string;
    wallet?: string;
    userAgent?: string;
    path?: string;
    sessionId?: string;
    referrer?: string;
    deviceInfo?: Record<string, any>;
  }): Promise<boolean> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!event.eventType) {
        this.logger.warn('Event tracking skipped: missing eventType');
        return false;
      }

      // ✅ 2. Costruzione oggetto dati con solo campi definiti
      const insertData: Record<string, any> = {
        event_type: event.eventType,
        created_at: new Date().toISOString(),
      };

      // Aggiungi solo campi definiti
      if (event.mangaId !== undefined) {
        insertData.manga_id = event.mangaId;
      }
      if (event.wallet) {
        insertData.wallet_address = event.wallet;
      } else {
        insertData.wallet_address = 'guest';
      }
      if (event.userAgent) {
        insertData.user_agent = event.userAgent;
      }
      if (event.path) {
        insertData.path = event.path;
      }
      if (event.sessionId) {
        insertData.session_id = event.sessionId;
      }
      if (event.referrer) {
        insertData.referrer = event.referrer;
      }
      if (event.deviceInfo) {
        insertData.device_info = event.deviceInfo;
      }

      // ✅ 3. Esecuzione insert con cast a any
      const { error } = await this.supabase
        .from('analytics_events')
        .insert(insertData as any); // ✅ Cast a any per Supabase

      if (error) {
        this.logger.error(
          `[Supabase] Error tracking event: ${error.message} (${error.code})`,
        );
        return false;
      }

      // ✅ 4. Aggiornamento statistiche in background (fire and forget)
      this.incrementDailyStats(event.eventType).catch((err) => {
        this.logger.warn(
          `[Analytics] Failed to increment daily stats: ${err.message}`,
        );
      });

      // ✅ 5. Emetti evento in background
      this.eventEmitter.emit('analytics.event', {
        ...event,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(
        `[Analytics] Event tracked: ${event.eventType}${event.mangaId ? ` for manga ${event.mangaId}` : ''}`,
      );

      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `[Analytics] Exception tracking event: ${error.message}`,
      );
      // ✅ 6. Non throw mai - tracking non deve bloccare l'applicazione
      return false;
    }
  }

  async incrementDailyStats(eventType: string): Promise<void> {
    this.checkConnection();

    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: existing } = await this.supabase
        .from('daily_stats')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      if (existing) {
        if (eventType === 'view') {
          const { error } = await this.supabase
            .from('daily_stats')
            // @ts-expect-error - Supabase strict types
            .update({ total_visits: (existing.total_visits || 0) + 1 })
            .eq('date', today);

          if (error) {
            this.logger.error(`Error updating daily stats: ${error.message}`);
          }
        } else if (eventType === 'click') {
          const { error } = await this.supabase
            .from('daily_stats')
            // @ts-expect-error - Supabase strict types
            .update({ total_clicks: (existing.total_clicks || 0) + 1 })
            .eq('date', today);

          if (error) {
            this.logger.error(`Error updating daily stats: ${error.message}`);
          }
        }
      } else {
        const { error } = await this.supabase
          .from('daily_stats')
          // @ts-expect-error - Supabase strict types
          .insert({
            date: today,
            total_visits: eventType === 'view' ? 1 : 0,
            total_clicks: eventType === 'click' ? 1 : 0,
            unique_wallets: 0,
          });

        if (error) {
          this.logger.error(`Error inserting daily stats: ${error.message}`);
        }
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Error incrementing daily stats: ${error.message}`);
    }
  }

  async getDailyStats(
    days: number = 30,
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedResult<DailyStat>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('daily_stats')
        .select('*', { count: 'exact' })
        .order('date', { ascending: false })
        .range(offset, offset + limit - 1)
        .limit(days);

      if (error) {
        this.handleError(error, 'getDailyStats');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getDailyStats');
    }
  }

  async getImportStats(days: number = 30): Promise<DailyStat[]> {
    this.checkConnection();

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await this.supabase
        .from('daily_stats')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) {
        this.handleError(error, 'getImportStats');
      }

      return data || [];
    } catch (err) {
      this.handleError(err, 'getImportStats');
    }
  }

  async getEventStats(): Promise<{
    views: number;
    clicks: number;
    voteUp: number;
    voteDown: number;
    other: number;
    total: number;
  }> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('analytics_events')
        .select('event_type');

      if (error) {
        this.handleError(error, 'getEventStats');
      }

      const stats = { views: 0, clicks: 0, voteUp: 0, voteDown: 0, other: 0 };
      const events = (data as EventData[]) || [];

      for (const event of events) {
        switch (event.event_type) {
          case 'view':
            stats.views++;
            break;
          case 'click':
            stats.clicks++;
            break;
          case 'vote_up':
            stats.voteUp++;
            break;
          case 'vote_down':
            stats.voteDown++;
            break;
          default:
            stats.other++;
        }
      }

      const total =
        stats.views +
        stats.clicks +
        stats.voteUp +
        stats.voteDown +
        stats.other;

      return { ...stats, total };
    } catch (err) {
      this.handleError(err, 'getEventStats');
    }
  }

  // ============================================
  // VOTI E BOOKMARKS
  // ============================================

  async voteManga(
    wallet: string,
    mangaId: number,
    voteType: 'up' | 'down',
  ): Promise<boolean> {
    this.checkConnection();

    try {
      if (!wallet) {
        this.logger.warn('Vote skipped: missing wallet');
        return false;
      }
      if (!mangaId || mangaId <= 0 || isNaN(mangaId)) {
        this.logger.warn(`Vote skipped: invalid mangaId ${mangaId}`);
        return false;
      }
      if (voteType !== 'up' && voteType !== 'down') {
        this.logger.warn(`Vote skipped: invalid voteType ${voteType}`);
        return false;
      }

      const manga = await this.getMangaById(mangaId);
      if (!manga) {
        this.logger.warn(`Vote skipped: manga ${mangaId} not found`);
        return false;
      }

      const { data: existing } = await this.supabase
        .from('votes')
        .select('*')
        .eq('user_wallet', wallet)
        .eq('manga_id', mangaId)
        .maybeSingle();

      if (existing) {
        const { error } = await this.supabase
          .from('votes')
          // @ts-expect-error - Supabase strict types
          .update({ vote_type: voteType, updated_at: new Date().toISOString() })
          .eq('id', (existing as Vote).id);

        if (error) {
          this.logger.error(`Error updating vote: ${error.message}`);
          return false;
        }
      } else {
        const { error } = await this.supabase
          .from('votes')
          // @ts-expect-error - Supabase strict types
          .insert({
            user_wallet: wallet,
            manga_id: mangaId,
            vote_type: voteType,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (error) {
          this.logger.error(`Error creating vote: ${error.message}`);
          return false;
        }
      }

      this.updateMangaVoteCounts(mangaId).catch((err) => {
        this.logger.warn(`Failed to update vote counts: ${err.message}`);
      });

      this.eventEmitter.emit('manga.vote', {
        mangaId,
        wallet,
        voteType,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Exception voting: ${error.message}`);
      return false;
    }
  }

  async updateMangaVoteCounts(mangaId: number): Promise<void> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!mangaId || mangaId <= 0 || isNaN(mangaId)) {
        this.logger.warn(
          `updateMangaVoteCounts skipped: invalid mangaId ${mangaId}`,
        );
        return;
      }

      // ✅ 2. Verifica che il manga esista
      const manga = await this.getMangaById(mangaId);
      if (!manga) {
        this.logger.warn(
          `updateMangaVoteCounts skipped: manga ${mangaId} not found`,
        );
        return;
      }

      // ✅ 3. Recupera tutti i voti per il manga
      const { data: votes, error } = await this.supabase
        .from('votes')
        .select('vote_type')
        .eq('manga_id', mangaId);

      if (error) {
        this.logger.error(
          `Error fetching votes for manga ${mangaId}: ${error.message} (${error.code})`,
        );
        return;
      }

      // ✅ 4. Calcola conteggi
      const votesData = (votes as VoteData[]) || [];
      const upVotes = votesData.filter((v) => v.vote_type === 'up').length;
      const downVotes = votesData.filter((v) => v.vote_type === 'down').length;

      // ✅ 5. Prepara i dati per l'update
      const updateData: Record<string, unknown> = {
        up_votes: upVotes,
        down_votes: downVotes,
      };

      // ✅ 6. Esegui update con cast a never
      const { error: updateError } = await this.supabase
        .from('manga')
        .update(updateData as never) // ✅ Cast a never invece di any
        .eq('id', mangaId);

      if (updateError) {
        this.logger.error(
          `Error updating vote counts for manga ${mangaId}: ${updateError.message} (${updateError.code})`,
        );
        return;
      }

      // ✅ 7. Invalida cache in background
      this.invalidateCache([`manga_${mangaId}`]).catch(() => {});

      this.logger.debug(
        `✅ Vote counts updated for manga ${mangaId}: ↑${upVotes} ↓${downVotes}`,
      );
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Exception updating vote counts: ${error.message}`);
    }
  }

  async saveBookmark(
    wallet: string,
    mangaId: number,
    page: number,
    totalPages: number,
  ): Promise<boolean> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!wallet) {
        this.logger.warn('saveBookmark skipped: missing wallet');
        return false;
      }

      if (!mangaId || mangaId <= 0 || isNaN(mangaId)) {
        this.logger.warn(`saveBookmark skipped: invalid mangaId ${mangaId}`);
        return false;
      }

      if (!page || page <= 0 || isNaN(page)) {
        this.logger.warn(`saveBookmark skipped: invalid page ${page}`);
        return false;
      }

      if (!totalPages || totalPages <= 0 || isNaN(totalPages)) {
        this.logger.warn(
          `saveBookmark skipped: invalid totalPages ${totalPages}`,
        );
        return false;
      }

      // ✅ 2. Verifica che il manga esista
      const manga = await this.getMangaById(mangaId);
      if (!manga) {
        this.logger.warn(`saveBookmark skipped: manga ${mangaId} not found`);
        return false;
      }

      // ✅ 3. Calcola status
      const status =
        page >= totalPages ? BookmarkStatus.COMPLETED : BookmarkStatus.READING;
      const now = new Date().toISOString();

      // ✅ 4. Verifica se esiste già un bookmark
      const { data: existing, error: fetchError } = await this.supabase
        .from('bookmarks')
        .select('id')
        .eq('user_wallet', wallet)
        .eq('manga_id', mangaId)
        .maybeSingle();

      if (fetchError) {
        this.logger.error(`Error fetching bookmark: ${fetchError.message}`);
        return false;
      }

      if (existing) {
        // ✅ 5. Aggiorna bookmark esistente
        const updateData: Record<string, unknown> = {
          last_page: page,
          status,
          updated_at: now,
        };

        const { error } = await this.supabase
          .from('bookmarks')
          .update(updateData as never) // ✅ Cast a never
          .eq('id', (existing as BookmarkId).id);

        if (error) {
          this.logger.error(
            `Error updating bookmark: ${error.message} (${error.code})`,
          );
          return false;
        }

        this.logger.debug(
          `✅ Bookmark updated for manga ${mangaId}: page ${page}/${totalPages} (${status})`,
        );
      } else {
        // ✅ 6. Crea nuovo bookmark
        const insertData: Record<string, unknown> = {
          user_wallet: wallet,
          manga_id: mangaId,
          last_page: page,
          status,
          added_at: now,
          updated_at: now,
        };

        const { error } = await this.supabase
          .from('bookmarks')
          .insert(insertData as never); // ✅ Cast a never

        if (error) {
          this.logger.error(
            `Error creating bookmark: ${error.message} (${error.code})`,
          );
          return false;
        }

        this.logger.debug(
          `✅ Bookmark created for manga ${mangaId}: page ${page}/${totalPages} (${status})`,
        );
      }

      // ✅ 7. Invalida cache in background
      this.invalidateCache([`bookmarks_${wallet}`]).catch(() => {});

      // ✅ 8. Emetti evento
      this.eventEmitter.emit('manga.bookmark', {
        mangaId,
        wallet,
        page,
        status,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Exception saving bookmark: ${error.message}`);
      return false;
    }
  }

  async getBookmark(wallet: string, mangaId: number): Promise<Bookmark | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('bookmarks')
        .select('*, manga:manga_id(*)')
        .eq('user_wallet', wallet)
        .eq('manga_id', mangaId)
        .maybeSingle();

      if (error) {
        this.logger.error(`Error fetching bookmark: ${error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Exception fetching bookmark: ${error.message}`);
      return null;
    }
  }

  async getUserBookmarks(
    wallet: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Bookmark>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('bookmarks')
        .select('*, manga:manga_id(*)', { count: 'exact' })
        .eq('user_wallet', wallet)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getUserBookmarks');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getUserBookmarks');
    }
  }

  // ============================================
  // SESSIONI DI LETTURA
  // ============================================

  async createReadingSession(
    wallet: string,
    mangaId: number,
    deviceType?: string,
  ): Promise<number | null> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!wallet) {
        this.logger.warn('createReadingSession skipped: missing wallet');
        return null;
      }

      if (!mangaId || mangaId <= 0 || isNaN(mangaId)) {
        this.logger.warn(
          `createReadingSession skipped: invalid mangaId ${mangaId}`,
        );
        return null;
      }

      // ✅ 2. Verifica che il manga esista
      const manga = await this.getMangaById(mangaId);
      if (!manga) {
        this.logger.warn(
          `createReadingSession skipped: manga ${mangaId} not found`,
        );
        return null;
      }

      // ✅ 3. Prepara i dati per l'inserimento
      const insertData: Record<string, unknown> = {
        user_wallet: wallet,
        manga_id: mangaId,
        start_time: new Date().toISOString(),
        device_type: deviceType || null,
        pages_read: [],
        last_page_timestamp: new Date().toISOString(),
      };

      // ✅ 4. Esegui insert con cast a never
      const { data, error } = await this.supabase
        .from('reading_sessions')
        .insert(insertData as never) // ✅ Cast a never
        .select('id')
        .single();

      if (error) {
        this.logger.error(
          `Error creating reading session: ${error.message} (${error.code})`,
        );
        return null;
      }

      // ✅ 5. Cast esplicito per accedere a 'id'
      const sessionData = data as { id: number };

      if (!sessionData?.id) {
        this.logger.error('Created session returned without ID');
        return null;
      }

      // ✅ 6. Emetti evento
      this.eventEmitter.emit('reading.started', {
        sessionId: sessionData.id,
        mangaId,
        wallet,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(
        `✅ Reading session created: ${sessionData.id} for manga ${mangaId} (wallet: ${wallet})`,
      );

      return sessionData.id;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Exception creating reading session: ${error.message}`);
      return null;
    }
  }

  async updateReadingSession(
    sessionId: number,
    endPage: number,
    totalPages: number,
  ): Promise<boolean> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!sessionId || sessionId <= 0 || isNaN(sessionId)) {
        this.logger.warn(
          `updateReadingSession skipped: invalid sessionId ${sessionId}`,
        );
        return false;
      }

      if (!endPage || endPage <= 0 || isNaN(endPage)) {
        this.logger.warn(
          `updateReadingSession skipped: invalid endPage ${endPage}`,
        );
        return false;
      }

      if (!totalPages || totalPages <= 0 || isNaN(totalPages)) {
        this.logger.warn(
          `updateReadingSession skipped: invalid totalPages ${totalPages}`,
        );
        return false;
      }

      // ✅ 2. Recupera la sessione con cast esplicito
      const { data: session, error: fetchError } = await this.supabase
        .from('reading_sessions')
        .select('start_time')
        .eq('id', sessionId)
        .single();

      if (fetchError) {
        this.logger.error(
          `Error fetching reading session ${sessionId}: ${fetchError.message} (${fetchError.code})`,
        );
        return false;
      }

      if (!session) {
        this.logger.error(`Reading session ${sessionId} not found`);
        return false;
      }

      // ✅ 3. Cast esplicito per accedere a 'start_time'
      const sessionData = session as { start_time: string };

      // ✅ 4. Calcola durata e completion rate
      const startTime = new Date(sessionData.start_time);
      const now = new Date();
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const completionRate = Math.min(100, (endPage / totalPages) * 100);

      // ✅ 5. Prepara i dati per l'update
      const updateData: Record<string, unknown> = {
        end_time: now.toISOString(),
        completion_rate: Number(completionRate.toFixed(2)),
        session_duration: duration,
        pages_read: [endPage],
        last_page_timestamp: now.toISOString(),
      };

      // ✅ 6. Esegui update con cast a never
      const { error } = await this.supabase
        .from('reading_sessions')
        .update(updateData as never)
        .eq('id', sessionId);

      if (error) {
        this.logger.error(
          `Error updating reading session ${sessionId}: ${error.message} (${error.code})`,
        );
        return false;
      }

      // ✅ 7. Emetti evento
      this.eventEmitter.emit('reading.updated', {
        sessionId,
        endPage,
        completionRate: Number(completionRate.toFixed(2)),
        duration,
        timestamp: now.toISOString(),
      });

      this.logger.debug(
        `✅ Reading session ${sessionId} updated: page ${endPage}/${totalPages} (${completionRate.toFixed(1)}%)`,
      );

      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Exception updating reading session: ${error.message}`);
      return false;
    }
  }

  async getUserReadingSessions(
    wallet: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<ReadingSession>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('reading_sessions')
        .select('*, manga:manga_id(*)', { count: 'exact' })
        .eq('user_wallet', wallet)
        .order('start_time', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getUserReadingSessions');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getUserReadingSessions');
    }
  }

  // ============================================
  // TOP MANGA E CLASSIFICHE
  // ============================================

  async getTopManga(
    period: 'day' | 'week' | 'month' | 'all' = 'week',
    limit: number = 10,
    page: number = 1,
  ): Promise<PaginatedResult<TopMangaView>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('analytics_events')
        .select('manga_id, count', { count: 'exact' })
        .eq('event_type', 'view')
        .not('manga_id', 'is', null)
        .gte('created_at', this.getPeriodStartDate(period))
        .order('count', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getTopManga');
      }

      const typedData = (data as { manga_id: number; count: number }[]) || [];
      const result: TopMangaView[] = [];

      for (const item of typedData) {
        const manga = await this.getMangaById(item.manga_id);
        if (manga) {
          result.push({
            id: manga.id,
            titolo: manga.titolo,
            immagine: manga.immagine,
            total_views: item.count,
            period,
          });
        }
      }

      return this.buildPaginatedResponse(result, count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getTopManga');
    }
  }

  private getPeriodStartDate(period: 'day' | 'week' | 'month' | 'all'): string {
    const now = new Date();
    switch (period) {
      case 'day':
        now.setDate(now.getDate() - 1);
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
      case 'all':
        now.setFullYear(now.getFullYear() - 10);
        break;
    }
    return now.toISOString();
  }

  async getMostViewedManga(
    limit: number = 10,
    page: number = 1,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data: viewData } = await this.supabase
        .from('analytics_events')
        .select('manga_id')
        .eq('event_type', 'view')
        .not('manga_id', 'is', null);

      // ✅ FIX: Cast esplicito per evitare 'never'
      const typedViewData = (viewData as { manga_id: number }[]) || [];

      if (typedViewData.length === 0) {
        return this.buildPaginatedResponse([], 0, page, limit);
      }

      const viewCount = new Map<number, number>();
      typedViewData.forEach((item) => {
        const id = item.manga_id;
        if (id) {
          viewCount.set(id, (viewCount.get(id) || 0) + 1);
        }
      });

      const sortedIds = Array.from(viewCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(offset, offset + limit)
        .map(([id]) => id);

      if (sortedIds.length === 0) {
        return this.buildPaginatedResponse([], 0, page, limit);
      }

      const { data, error, count } = await this.supabase
        .from('manga')
        .select('*', { count: 'exact' })
        .in('id', sortedIds);

      if (error) {
        this.handleError(error, 'getMostViewedManga');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getMostViewedManga');
    }
  }

  async getHighestRatedManga(
    limit: number = 10,
    page: number = 1,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('manga')
        .select('*', { count: 'exact' })
        .order('up_votes', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getHighestRatedManga');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getHighestRatedManga');
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  async checkHealth(): Promise<HealthCheckResponse> {
    const start = Date.now();
    const tables: Record<string, boolean> = {};

    try {
      this.checkConnection();

      const tableNames = ['manga', 'artisti', 'tags', 'users'];

      for (const tableName of tableNames) {
        try {
          const { error } = await this.supabase
            .from(tableName)
            .select('id')
            .limit(1);
          tables[tableName] = !error;
        } catch {
          tables[tableName] = false;
        }
      }

      const allOk = Object.values(tables).every((v) => v);
      const latency = Date.now() - start;

      this.eventEmitter.emit('supabase.health', {
        status: allOk ? 'ok' : 'degraded',
        latency,
        tables,
        timestamp: new Date().toISOString(),
      });

      return {
        status: allOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        latency,
        tables,
      };
    } catch (err) {
      const latency = Date.now() - start;

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        latency,
        tables,
      };
    }
  }

  async getDatabaseStats(): Promise<{
    mangaCount: number;
    artistCount: number;
    tagCount: number;
    categoryCount: number;
    userCount: number;
    totalVotes: number;
    totalBookmarks: number;
    totalComments: number;
    totalReadingSessions: number;
    totalAnalyticsEvents: number;
    databaseSize?: string;
    lastUpdated: string;
  }> {
    this.checkConnection();

    try {
      const [
        manga,
        artisti,
        tags,
        categorie,
        users,
        votes,
        bookmarks,
        comments,
        sessions,
        analytics,
      ] = await Promise.all([
        this.supabase.from('manga').select('*', { count: 'exact', head: true }),
        this.supabase
          .from('artisti')
          .select('*', { count: 'exact', head: true }),
        this.supabase.from('tags').select('*', { count: 'exact', head: true }),
        this.supabase
          .from('categorie')
          .select('*', { count: 'exact', head: true }),
        this.supabase.from('users').select('*', { count: 'exact', head: true }),
        this.supabase.from('votes').select('*', { count: 'exact', head: true }),
        this.supabase
          .from('bookmarks')
          .select('*', { count: 'exact', head: true }),
        this.supabase
          .from('comments')
          .select('*', { count: 'exact', head: true }),
        this.supabase
          .from('reading_sessions')
          .select('*', { count: 'exact', head: true }),
        this.supabase
          .from('analytics_events')
          .select('*', { count: 'exact', head: true }),
      ]);

      const { count: uniqueVoters } = await this.supabase
        .from('votes')
        .select('user_wallet', { count: 'exact', head: true });

      return {
        mangaCount: manga.count || 0,
        artistCount: artisti.count || 0,
        tagCount: tags.count || 0,
        categoryCount: categorie.count || 0,
        userCount: users.count || 0,
        totalVotes: votes.count || 0,
        totalBookmarks: bookmarks.count || 0,
        totalComments: comments.count || 0,
        totalReadingSessions: sessions.count || 0,
        totalAnalyticsEvents: analytics.count || 0,
        databaseSize: '~100 MB',
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      this.handleError(err, 'getDatabaseStats');
    }
  }

  async searchManga(
    searchTerm: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('manga')
        .select('*', { count: 'exact' })
        .ilike('titolo', `%${searchTerm}%`)
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'searchManga');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'searchManga');
    }
  }

  async getMangaByArtist(
    artistId: number,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('manga')
        .select('*', { count: 'exact' })
        .eq('artista_id', artistId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getMangaByArtist');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getMangaByArtist');
    }
  }

  async getMangaByCategory(
    categoryId: number,
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('manga')
        .select('*', { count: 'exact' })
        .eq('categoria_id', categoryId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getMangaByCategory');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getMangaByCategory');
    }
  }

  async getRelatedManga(
    mangaId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const tags = await this.getMangaTags(mangaId);
      const tagIds = tags.map((t) => t.id);

      if (tagIds.length === 0) {
        return this.buildPaginatedResponse([], 0, page, limit);
      }

      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('manga_tags')
        .select(
          `
          manga_id,
          manga:manga_id (*)
        `,
          { count: 'exact' },
        )
        .in('tag_id', tagIds)
        .neq('manga_id', mangaId)
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getRelatedManga');
      }

      const uniqueManga = new Map<number, Manga>();
      const relatedData = data as unknown as RelatedMangaData[];

      for (const item of relatedData || []) {
        if (item.manga && !uniqueManga.has(item.manga_id)) {
          uniqueManga.set(item.manga_id, item.manga);
        }
      }

      const result = Array.from(uniqueManga.values());

      return this.buildPaginatedResponse(result, result.length, page, limit);
    } catch (err) {
      this.handleError(err, 'getRelatedManga');
    }
  }

  async getAllMangaForHome(
    page: number = 1,
    limit: number = 50,
  ): Promise<PaginatedResult<Manga>> {
    return this.getAllManga(page, limit);
  }

  async getAllMangaAdmin(
    page: number = 1,
    limit: number = 100,
    includeHidden: boolean = true,
  ): Promise<PaginatedResult<Manga>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      let query = this.supabase.from('manga').select('*', { count: 'exact' });

      if (!includeHidden) {
        query = query.eq('visible', true);
      }

      const { data, error, count } = await query
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getAllMangaAdmin');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getAllMangaAdmin');
    }
  }

  clearMetadataCache(): void {
    this.logger.log('Clearing metadata cache');
  }

  // ============================================
  // METODI PER UTENTI E AUTENTICAZIONE
  // ============================================

  // Aggiungi questa utility function nella classe
  private castUser(data: unknown): User {
    return data as User;
  }

  async findOrCreateUserFromGoogle(profile: GoogleUser): Promise<User | null> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!profile?.email) {
        this.logger.warn('findOrCreateUserFromGoogle: missing email');
        return null;
      }

      const email = profile.email;
      const googleId = profile.providerId;

      if (!googleId) {
        this.logger.warn(
          `findOrCreateUserFromGoogle: missing googleId for email ${email}`,
        );
        return null;
      }

      this.logger.log(
        `🔍 Cerca utente con email: ${email} o google_id: ${googleId}`,
      );

      // ✅ 2. Cerca per google_id
      const { data: userByGoogleId } = await this.supabase
        .from('users')
        .select('*')
        .eq('google_id', googleId)
        .maybeSingle();

      if (userByGoogleId) {
        const user = this.castUser(userByGoogleId);
        this.logger.log(`✅ Utente trovato tramite google_id: ${user.id}`);

        // ✅ Aggiorna last_login con cast a never
        const updateData: Record<string, unknown> = {
          last_login: new Date().toISOString(),
        };

        await this.supabase
          .from('users')
          .update(updateData as never) // ✅ Cast a never
          .eq('id', user.id);

        // ✅ Invalida cache
        await this.invalidateCache([`user_${user.id}`]);

        return user;
      }

      // ✅ 3. Cerca per email
      const { data: userByEmail } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (userByEmail) {
        const existingUser = this.castUser(userByEmail);
        this.logger.log(
          `✅ Utente trovato tramite email: ${existingUser.id}, aggiorno con google_id`,
        );

        // ✅ Prepara i dati di update con Record<string, unknown>
        const updateData: Record<string, unknown> = {
          google_id: googleId,
          avatar_url: profile.picture || existingUser.avatar_url,
          name:
            `${profile.firstName} ${profile.lastName}`.trim() ||
            existingUser.name,
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: updatedUser } = await this.supabase
          .from('users')
          .update(updateData as never) // ✅ Cast a never
          .eq('id', existingUser.id)
          .select()
          .single();

        if (!updatedUser) {
          this.logger.error(
            `❌ Errore aggiornamento utente esistente ${existingUser.id}`,
          );
          return null;
        }

        // ✅ Invalida cache
        await this.invalidateCache([`user_${existingUser.id}`]);

        return this.castUser(updatedUser);
      }

      // ✅ 4. Crea nuovo utente
      this.logger.log(`🆕 Creazione nuovo utente per email: ${email}`);

      const newUserData: Record<string, unknown> = {
        email,
        google_id: googleId,
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        avatar_url: profile.picture || null,
        provider: 'google',
        role: 'user',
        last_login: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: createdUser } = await this.supabase
        .from('users')
        .insert(newUserData as never) // ✅ Cast a never
        .select()
        .single();

      if (!createdUser) {
        this.logger.error(
          `❌ Errore creazione nuovo utente per email: ${email}`,
        );
        return null;
      }

      const user = this.castUser(createdUser);
      this.logger.log(`✅ Nuovo utente creato con ID: ${user.id}`);

      // ✅ Invalida cache
      await this.invalidateCache([`user_${user.id}`]);

      // ✅ Emetti evento
      this.eventEmitter.emit('user.created', {
        userId: user.id,
        email: user.email,
        provider: 'google',
        timestamp: new Date().toISOString(),
      });

      return user;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `❌ Eccezione in findOrCreateUserFromGoogle: ${error.message}`,
      );
      return null;
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        this.logger.error(
          `❌ Errore recupero utente ${userId}: ${error.message}`,
        );
        return null;
      }

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in getUserById: ${error.message}`);
      return null;
    }
  }

  async findUserByWallet(wallet: string): Promise<User | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('wallet_address', wallet.toLowerCase())
        .maybeSingle();

      if (error) {
        this.logger.error(
          `❌ Errore ricerca utente per wallet: ${error.message}`,
        );
        return null;
      }

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in findUserByWallet: ${error.message}`);
      return null;
    }
  }

  async connectWalletToUser(
    userId: string,
    wallet: string,
  ): Promise<User | null> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!userId) {
        this.logger.warn('connectWalletToUser skipped: missing userId');
        return null;
      }

      if (!wallet) {
        this.logger.warn('connectWalletToUser skipped: missing wallet');
        return null;
      }

      const normalizedWallet = wallet.toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
        this.logger.warn(
          `connectWalletToUser skipped: invalid wallet format ${wallet}`,
        );
        return null;
      }

      // ✅ 2. Verifica che l'utente esista
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        this.logger.warn(`connectWalletToUser: user ${userId} not found`);
        return null;
      }

      // ✅ 3. Verifica che il wallet non sia già associato a un altro utente
      const walletUser = await this.findUserByWallet(normalizedWallet);
      if (walletUser && walletUser.id !== userId) {
        this.logger.warn(
          `connectWalletToUser: wallet ${normalizedWallet} already connected to another user`,
        );
        return null;
      }

      // ✅ 4. Se il wallet è già associato a questo utente, ritorna l'utente
      if (walletUser && walletUser.id === userId) {
        this.logger.debug(
          `connectWalletToUser: wallet already connected to user ${userId}`,
        );
        return existingUser;
      }

      // ✅ 5. Prepara i dati per l'update
      const updateData: Record<string, unknown> = {
        wallet_address: normalizedWallet,
        updated_at: new Date().toISOString(),
      };

      // ✅ 6. Esegui update con cast a never
      const { data, error } = await this.supabase
        .from('users')
        .update(updateData as never) // ✅ Cast a never invece di UserUpdate
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `❌ Errore collegamento wallet per utente ${userId}: ${error.message} (${error.code})`,
        );
        return null;
      }

      // ✅ 7. Invalida cache
      await this.invalidateCache([
        `user_${userId}`,
        `wallet_${normalizedWallet}`,
        'user-stats',
      ]);

      // ✅ 8. Emetti evento
      this.eventEmitter.emit('user.wallet_connected', {
        userId,
        wallet: normalizedWallet,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `✅ Wallet ${normalizedWallet} collegato all'utente ${userId}`,
      );
      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `❌ Eccezione in connectWalletToUser: ${error.message}`,
      );
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        this.logger.error(
          `❌ Errore recupero utente per email ${email}: ${error.message}`,
        );
        return null;
      }

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in getUserByEmail: ${error.message}`);
      return null;
    }
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('google_id', googleId)
        .maybeSingle();

      if (error) {
        this.logger.error(
          `❌ Errore recupero utente per google_id ${googleId}: ${error.message}`,
        );
        return null;
      }

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in getUserByGoogleId: ${error.message}`);
      return null;
    }
  }

  async updateUserLastLogin(userId: string): Promise<boolean> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!userId) {
        this.logger.warn('updateUserLastLogin skipped: missing userId');
        return false;
      }

      // ✅ 2. Verifica che l'utente esista
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        this.logger.warn(
          `updateUserLastLogin skipped: user ${userId} not found`,
        );
        return false;
      }

      // ✅ 3. Prepara i dati per l'update
      const updateData: Record<string, unknown> = {
        last_login: new Date().toISOString(),
      };

      // ✅ 4. Esegui update con cast a never
      const { error } = await this.supabase
        .from('users')
        .update(updateData as never) // ✅ Cast a never
        .eq('id', userId);

      if (error) {
        this.logger.error(
          `❌ Errore aggiornamento last_login per utente ${userId}: ${error.message} (${error.code})`,
        );
        return false;
      }

      // ✅ 5. Invalida cache in background
      this.invalidateCache([`user_${userId}`]).catch(() => {});

      this.logger.debug(`✅ Last login updated for user: ${userId}`);
      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `❌ Eccezione in updateUserLastLogin: ${error.message}`,
      );
      return false;
    }
  }

  async isAdminWallet(walletAddress: string): Promise<boolean> {
    this.checkConnection();

    try {
      const { data, error } = await this.supabase
        .from('admin_users')
        .select('id')
        .eq('wallet_address', walletAddress.toLowerCase())
        .maybeSingle();

      if (error) {
        this.logger.error(`❌ Errore verifica admin wallet: ${error.message}`);
        return false;
      }

      return !!data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in isAdminWallet: ${error.message}`);
      return false;
    }
  }

  async isAdminUser(userId: string): Promise<boolean> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!userId) {
        this.logger.warn('isAdminUser skipped: missing userId');
        return false;
      }

      // ✅ 2. Recupera il ruolo dell'utente con cast esplicito
      const { data, error } = await this.supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) {
        // ✅ 3. Gestione errori specifici
        if (error.code === 'PGRST116') {
          this.logger.warn(`isAdminUser: user ${userId} not found`);
          return false;
        }
        this.logger.error(
          `❌ Errore verifica admin user: ${error.message} (${error.code})`,
        );
        return false;
      }

      // ✅ 4. Cast esplicito per accedere a 'role'
      const userData = data as { role: string } | null;

      // ✅ 5. Verifica ruolo
      return userData?.role === 'admin';
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in isAdminUser: ${error.message}`);
      return false;
    }
  }

  async getAllUsers(
    page: number = 1,
    limit: number = 100,
    filters?: {
      role?: string;
      isActive?: boolean;
      search?: string;
    },
  ): Promise<PaginatedResult<User>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      let query = this.supabase.from('users').select('*', { count: 'exact' });

      if (filters?.role) {
        query = query.eq('role', filters.role);
      }

      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters?.search) {
        query = query.or(
          `email.ilike.%${filters.search}%,name.ilike.%${filters.search}%`,
        );
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getAllUsers');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getAllUsers');
    }
  }

  async getUserStats(): Promise<{
    total_users: number;
    active_today: number;
    active_week: number;
    active_month: number;
    google_users: number;
  }> {
    this.checkConnection();

    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const monthAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [total, todayActive, weekActive, monthActive, google] =
        await Promise.all([
          this.supabase
            .from('users')
            .select('*', { count: 'exact', head: true }),
          this.supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('last_login', today),
          this.supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('last_login', weekAgo),
          this.supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gte('last_login', monthAgo),
          this.supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('provider', 'google'),
        ]);

      return {
        total_users: total.count || 0,
        active_today: todayActive.count || 0,
        active_week: weekActive.count || 0,
        active_month: monthActive.count || 0,
        google_users: google.count || 0,
      };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in getUserStats: ${error.message}`);
      return {
        total_users: 0,
        active_today: 0,
        active_week: 0,
        active_month: 0,
        google_users: 0,
      };
    }
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<User>,
  ): Promise<User | null> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!userId) {
        this.logger.warn('updateUserProfile skipped: missing userId');
        return null;
      }

      // ✅ 2. Verifica che l'utente esista
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        this.logger.warn(`updateUserProfile skipped: user ${userId} not found`);
        return null;
      }

      // ✅ 3. Verifica che ci siano dati da aggiornare
      if (!updates || Object.keys(updates).length === 0) {
        this.logger.debug(`updateUserProfile: no updates for user ${userId}`);
        return existingUser;
      }

      // ✅ 4. Prepara i dati per l'update (solo campi consentiti)
      const updateData: Record<string, unknown> = {};

      // ✅ 5. Aggiungi solo campi validi
      if (updates.name !== undefined) {
        updateData.name = updates.name;
      }
      if (updates.avatar_url !== undefined) {
        updateData.avatar_url = updates.avatar_url;
      }

      // ✅ 6. Aggiungi sempre updated_at
      updateData.updated_at = new Date().toISOString();

      // ✅ 7. Se non ci sono campi da aggiornare (oltre a updated_at)
      if (Object.keys(updateData).length === 1 && updateData.updated_at) {
        return existingUser;
      }

      // ✅ 8. Esegui update con cast a never
      const { data, error } = await this.supabase
        .from('users')
        .update(updateData as never) // ✅ Cast a never invece di any
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `❌ Errore aggiornamento profilo utente ${userId}: ${error.message} (${error.code})`,
        );
        return null;
      }

      // ✅ 9. Invalida cache
      await this.invalidateCache([`user_${userId}`]);

      // ✅ 10. Emetti evento
      this.eventEmitter.emit('user.profile_updated', {
        userId,
        updates: Object.keys(updateData).filter((k) => k !== 'updated_at'),
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `✅ Profilo utente ${userId} aggiornato: ${Object.keys(updateData)
          .filter((k) => k !== 'updated_at')
          .join(', ')}`,
      );

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in updateUserProfile: ${error.message}`);
      return null;
    }
  }

  async updateUserRole(
    userId: string,
    role: 'user' | 'admin' | 'editor',
  ): Promise<User | null> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!userId) {
        this.logger.warn('updateUserRole skipped: missing userId');
        return null;
      }

      if (!role || !['user', 'admin', 'editor'].includes(role)) {
        this.logger.warn(`updateUserRole skipped: invalid role ${role}`);
        return null;
      }

      // ✅ 2. Verifica che l'utente esista
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        this.logger.warn(`updateUserRole skipped: user ${userId} not found`);
        return null;
      }

      // ✅ 3. Se il ruolo è già quello richiesto, ritorna subito
      if (existingUser.role === role) {
        this.logger.debug(`User ${userId} already has role ${role}`);
        return existingUser;
      }

      // ✅ 4. Prepara i dati per l'update
      const updateData: Record<string, unknown> = {
        role: role,
        updated_at: new Date().toISOString(),
      };

      // ✅ 5. Esegui update con cast a never
      const { data, error } = await this.supabase
        .from('users')
        .update(updateData as never) // ✅ Cast a never
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `❌ Errore aggiornamento ruolo utente ${userId}: ${error.message} (${error.code})`,
        );
        return null;
      }

      // ✅ 6. Invalida cache
      await this.invalidateCache([`user_${userId}`, 'user-stats']);

      // ✅ 7. Emetti evento
      this.eventEmitter.emit('user.role_changed', {
        userId,
        oldRole: existingUser.role,
        newRole: role,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `✅ Ruolo utente ${userId} aggiornato: ${existingUser.role} -> ${role}`,
      );

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in updateUserRole: ${error.message}`);
      return null;
    }
  }

  async setUserActive(userId: string, isActive: boolean): Promise<User | null> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!userId) {
        this.logger.warn('setUserActive skipped: missing userId');
        return null;
      }

      // ✅ 2. Verifica che l'utente esista
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        this.logger.warn(`setUserActive skipped: user ${userId} not found`);
        return null;
      }

      // ✅ 3. Se lo stato è già quello richiesto, ritorna subito
      if (existingUser.is_active === isActive) {
        this.logger.debug(
          `User ${userId} already ${isActive ? 'active' : 'inactive'}`,
        );
        return existingUser;
      }

      // ✅ 4. Prepara i dati per l'update
      const updateData: Record<string, unknown> = {
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      // ✅ 5. Esegui update con cast a never
      const { data, error } = await this.supabase
        .from('users')
        .update(updateData as never) // ✅ Cast a never
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `❌ Errore modifica stato utente ${userId}: ${error.message} (${error.code})`,
        );
        return null;
      }

      // ✅ 6. Invalida cache
      await this.invalidateCache([`user_${userId}`, 'user-stats']);

      // ✅ 7. Emetti evento
      this.eventEmitter.emit('user.status_changed', {
        userId,
        isActive,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `✅ Utente ${userId} ${isActive ? 'attivato' : 'disattivato'} con successo`,
      );

      return data;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in setUserActive: ${error.message}`);
      return null;
    }
  }

  async getAdminUsers(
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedResult<AdminUser>> {
    this.checkConnection();

    try {
      const offset = (page - 1) * limit;

      const { data, error, count } = await this.supabase
        .from('admin_users')
        .select('*', { count: 'exact' })
        .order('ultimo_accesso', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        this.handleError(error, 'getAdminUsers');
      }

      return this.buildPaginatedResponse(data || [], count || 0, page, limit);
    } catch (err) {
      this.handleError(err, 'getAdminUsers');
    }
  }

  async addAdminWallet(
    walletAddress: string,
    username?: string,
  ): Promise<boolean> {
    this.checkConnection();

    try {
      // ✅ 1. Validazione input
      if (!walletAddress) {
        throw new BadRequestException('Wallet address is required');
      }

      const normalizedWallet = walletAddress.toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) {
        throw new BadRequestException('Invalid wallet address format');
      }

      // ✅ 2. Verifica se il wallet esiste già
      const exists = await this.isAdminWallet(normalizedWallet);
      if (exists) {
        throw new BadRequestException(
          'Questo wallet è già registrato come admin',
        );
      }

      // ✅ 3. Prepara i dati per l'inserimento
      const adminData: Record<string, unknown> = {
        wallet_address: normalizedWallet,
        username: username || null,
        ultimo_accesso: new Date().toISOString(),
      };

      // ✅ 4. Inserisci con cast a never
      const { error } = await this.supabase
        .from('admin_users')
        .insert(adminData as never); // ✅ Cast a never invece di any

      if (error) {
        this.logger.error(`❌ Errore aggiunta admin wallet: ${error.message}`);
        if (error.code === '23505') {
          throw new BadRequestException(
            'Questo wallet è già registrato come admin',
          );
        }
        return false;
      }

      // ✅ 5. Invalida cache
      await this.invalidateCache(['admin-users-*']);

      // ✅ 6. Emetti evento
      this.eventEmitter.emit('admin.wallet.added', {
        wallet: normalizedWallet,
        username,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`✅ Admin wallet aggiunto: ${normalizedWallet}`);
      return true;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;

      const error = err as Error;
      this.logger.error(`❌ Eccezione in addAdminWallet: ${error.message}`);
      return false;
    }
  }

  async removeAdminWallet(walletAddress: string): Promise<boolean> {
    this.checkConnection();

    try {
      const { error } = await this.supabase
        .from('admin_users')
        .delete()
        .eq('wallet_address', walletAddress.toLowerCase());

      if (error) {
        this.logger.error(`❌ Errore rimozione admin wallet: ${error.message}`);
        return false;
      }

      this.eventEmitter.emit('admin.wallet.removed', {
        wallet: walletAddress.toLowerCase(),
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`❌ Eccezione in removeAdminWallet: ${error.message}`);
      return false;
    }
  }

  async updateAdminLastAccess(walletAddress: string): Promise<boolean> {
    this.checkConnection();

    try {
      const updateData: Record<string, unknown> = {
        ultimo_accesso: new Date().toISOString(),
      };

      const { error } = await this.supabase
        .from('admin_users')
        .update(updateData as never) // ✅ Cast a never
        .eq('wallet_address', walletAddress.toLowerCase());

      if (error) {
        this.logger.error(
          `❌ Errore aggiornamento admin access: ${error.message}`,
        );
        return false;
      }

      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `❌ Eccezione in updateAdminLastAccess: ${error.message}`,
      );
      return false;
    }
  }

  getClient(): SupabaseClient<Database> {
    this.checkConnection();
    return this.supabase;
  }
}
