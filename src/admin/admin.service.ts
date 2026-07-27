import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ImportService } from '../import/import.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type {
  Manga,
  DailyStat,
  Artista,
  Tag,
  Categoria,
  MangaUpdate,
  User,
  AdminUser,
  Vote,
  Bookmark,
  Comment,
  ReadingSession,
  AnalyticsEvent,
} from '../supabase/supabase.service';
import axios from 'axios';
import type { ImportResult } from '../import/interfaces/gallery.interface';

// ============================================
// ENUM E COSTANTI
// ============================================

export enum AdminAction {
  IMPORT = 'import',
  BULK_IMPORT = 'bulk_import',
  UPDATE = 'update',
  DELETE = 'delete',
  RESTORE = 'restore',
  REPAIR = 'repair',
  CLEAR_CACHE = 'clear_cache',
  ADD_TAG = 'add_tag',
  REMOVE_TAG = 'remove_tag',
  UPDATE_USER_ROLE = 'update_user_role',
  UPDATE_USER_STATUS = 'update_user_status',
  ADD_ADMIN_WALLET = 'add_admin_wallet',
  REMOVE_ADMIN_WALLET = 'remove_admin_wallet',
}

export enum ImportSource {
  HENTAIFOX = 'hentaifox',
  NHENTAI = 'nhentai',
  OTHER = 'other',
}

export enum RepairStatus {
  WORKING = 'working',
  BROKEN = 'broken',
  FIXED = 'fixed',
  UNKNOWN = 'unknown',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  EDITOR = 'editor',
}

// ============================================
// INTERFACCE E DTOs
// ============================================

export interface ArtistResponse {
  id: number;
  nome: string;
  counter: number;
  mangaCount?: number;
  lastUsed?: string;
}

export interface TagResponse {
  id: number;
  nome: string;
  counter: number;
  usageCount?: number;
  mangaCount?: number;
}

export interface CategoryResponse {
  id: number;
  nome: string;
  counter: number;
  mangaCount?: number;
}

export interface SystemStats {
  total_manga: number;
  total_artists: number;
  total_tags: number;
  total_categories: number;
  total_users: number;
  recent_manga: number;
  total_views_today: number;
  active_users_now: number;
  database_size?: string;
  version?: string;
}

export interface PopularTag {
  nome: string;
  count: number;
  percentage?: number;
}

export interface QuickStats {
  total_manga: number;
  total_artists: number;
  total_tags: number;
  total_categories: number;
  total_views_today: number;
  active_users: number;
  completion_rate?: number;
}

export interface DailyStatResponse {
  id: number;
  date: string;
  total_visits: number;
  total_clicks: number;
  unique_wallets: number;
  conversion_rate?: number;
}

export interface MangaRepairItem {
  id: number;
  immagine: string | null;
  titolo: string;
  current_server?: string;
  status?: RepairStatus;
}

export interface PopularTagData {
  tags?: {
    nome: string;
  };
}

export interface UpdateMangaData {
  titolo?: string;
  immagine?: string;
  lingua?: string;
  visible?: boolean;
  artista_id?: number | null;
  categoria_id?: number | null;
  numero_pagine?: number | null;
  url_origine?: string | null;
  pagine?: any[] | null;
}

export interface BulkImportResult {
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  details: Array<
    ImportResult & { url: string; duration?: number; source?: ImportSource }
  >;
  requestId?: string;
  duration?: number;
}

export interface UserStats {
  total_users: number;
  active_today: number;
  active_week: number;
  active_month: number;
  google_users: number;
  wallet_users: number;
  email_users: number;
  new_users_today: number;
  new_users_week: number;
  new_users_month: number;
}

export interface AdminUserResponse {
  id: number;
  wallet_address: string;
  username: string | null;
  ultimo_accesso: string | null;
  last_login?: string;
  created_at?: string;
}

export interface EventStatsResponse {
  views: number;
  clicks: number;
  voteUp: number;
  voteDown: number;
  other: number;
  total: number;
  byHour?: number[];
  byDay?: number[];
}

export interface DatabaseStatsResponse {
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
  lastUpdated?: string;
  tablespace?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  count?: number;
  latency?: number;
  timestamp?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  services: {
    database: 'up' | 'down';
    import: 'up' | 'down';
    storage: 'up' | 'down';
  };
  metrics: {
    responseTime: number;
    activeRequests: number;
    uptime: number;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ImportOptions {
  source?: ImportSource;
  priority?: 'high' | 'normal' | 'low';
  validateOnly?: boolean;
}

export interface RepairOptions {
  dryRun?: boolean;
  servers?: string[];
  timeout?: number;
  concurrency?: number;
}

// ============================================
// SERVICE PRINCIPALE - VERSIONE CORRETTA
// ============================================

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly SERVER_VARIANTS = [
    'i3',
    'i7',
    'i1',
    'i2',
    't',
    't3',
    'i5',
    'i',
    'i8',
  ];
  private readonly CACHE_TTL = {
    artists: 300000,
    tags: 300000,
    categories: 300000,
    stats: 60000,
    systemStats: 300000,
    users: 60000,
    databaseStats: 300000,
    eventStats: 300000,
  };
  private readonly requestCounter: number = 0;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly importService: ImportService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.logger.log(
      '🚀 AdminService initialized with enterprise configuration',
    );
  }

  // ============================================
  // METODI PRIVATI DI SUPPORTO
  // ============================================

  private generateRequestId(): string {
    return `admin_svc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  private async withCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttl: number = 300000,
  ): Promise<T> {
    try {
      const cached = await this.cacheManager.get<T>(key);
      if (cached) {
        this.logger.debug(`Cache HIT: ${key}`);
        return cached;
      }
    } catch {
      this.logger.debug(`Cache get failed for: ${key}, skipping cache`);
    }

    this.logger.debug(`Cache MISS: ${key}`);
    const result = await operation();

    try {
      await this.cacheManager.set(key, result, ttl);
    } catch (err) {
      this.logger.warn(
        `Cache set failed for: ${key}: ${this.getErrorMessage(err)}`,
      );
    }

    return result;
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      requestId?: string;
    } = {},
  ): Promise<T> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      requestId = 'unknown',
    } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        this.logger.warn(
          `[${requestId}] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
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
      try {
        await this.cacheManager.del(pattern);
      } catch (err) {
        this.logger.warn(
          `Cache del failed for: ${pattern}: ${this.getErrorMessage(err)}`,
        );
      }
    }
    this.logger.debug(
      `🧹 Cache invalidated for patterns: ${patterns.join(', ')}`,
    );
  }

  private extractServer(url: string): string {
    const match = url.match(/(i\d+|t\d*)\./);
    return match ? match[1] : 'unknown';
  }

  private getErrorMessage(error: unknown): string {
    if (!error) return 'Unknown error';

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      if ('message' in errorObj && typeof errorObj.message === 'string') {
        return errorObj.message;
      }
      if ('code' in errorObj && typeof errorObj.code === 'string') {
        return `Error ${errorObj.code}`;
      }
    }

    return 'Unknown error';
  }

  private validateId(id: number, name: string = 'ID'): void {
    if (!id || id <= 0 || isNaN(id)) {
      throw new BadRequestException(`${name} non valido`);
    }
  }

  private validateWallet(wallet: string): string {
    if (!wallet) {
      throw new BadRequestException('Wallet address required');
    }

    const normalized = wallet.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      throw new BadRequestException('Invalid wallet address format');
    }

    return normalized;
  }

  private validateUrl(url: string): string {
    try {
      new URL(url);
      return url;
    } catch {
      throw new BadRequestException('URL non valido');
    }
  }

  private emptyPaginatedResponse<T>(
    page: number,
    limit: number,
  ): PaginatedResponse<T> {
    return {
      data: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    };
  }

  // ============================================
  // METODI PER I MANGA
  // ============================================

  async getAllMangaList(
    page: number = 1,
    limit: number = 50,
    filters?: {
      visible?: boolean;
      search?: string;
      artistId?: number;
      categoryId?: number;
      tagId?: number;
    },
  ): Promise<PaginatedResponse<Manga>> {
    const requestId = this.generateRequestId();

    try {
      const pageNum = Math.max(1, page);
      const limitNum = Math.min(100, Math.max(1, limit));
      const offset = (pageNum - 1) * limitNum;

      let query = this.supabaseService.supabase
        .from('manga')
        .select('*', { count: 'exact' });

      if (filters?.visible !== undefined) {
        query = query.eq('visible', filters.visible);
      }

      if (filters?.search) {
        query = query.ilike('titolo', `%${filters.search}%`);
      }

      if (filters?.artistId) {
        query = query.eq('artista_id', filters.artistId);
      }

      if (filters?.categoryId) {
        query = query.eq('categoria_id', filters.categoryId);
      }

      if (filters?.tagId) {
        const { data: tagRelations, error: tagError } =
          await this.supabaseService.supabase
            .from('manga_tags')
            .select('manga_id')
            .eq('tag_id', filters.tagId);

        if (tagError) throw tagError;

        if (tagRelations && tagRelations.length > 0) {
          const mangaIds = tagRelations.map(
            (m: { manga_id: number }) => m.manga_id,
          );
          query = query.in('id', mangaIds);
        } else {
          return this.emptyPaginatedResponse<Manga>(pageNum, limitNum);
        }
      }

      const { data, error, count } = await query
        .order('id', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / limitNum);

      this.logger.log(
        `[${requestId}] Retrieved ${data?.length || 0} manga (Total: ${totalCount})`,
      );

      return {
        data: data || [],
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting manga list: ${errorMessage}`,
      );
      throw new InternalServerErrorException('Failed to retrieve manga list');
    }
  }

  async getAllMangaAdmin(includeHidden: boolean = true): Promise<Manga[]> {
    const requestId = this.generateRequestId();
    const cacheKey = `admin_manga_all_${includeHidden}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          let query = this.supabaseService.supabase
            .from('manga')
            .select('*')
            .order('id', { ascending: false });

          if (!includeHidden) {
            query = query.eq('visible', true);
          }

          const { data, error } = await query;

          if (error) throw error;

          this.logger.log(
            `[${requestId}] Retrieved ${data?.length || 0} manga for admin`,
          );
          return data || [];
        },
        this.CACHE_TTL.stats,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting manga admin: ${errorMessage}`,
      );
      return [];
    }
  }

  async getMangaById(id: number): Promise<Manga | null> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Manga ID');

    const cacheKey = `manga_${id}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const manga = await this.supabaseService.getMangaById(id);
          if (!manga) {
            throw new NotFoundException(`Manga ${id} non trovato`);
          }
          return manga;
        },
        300000,
      );
    } catch (err) {
      if (err instanceof NotFoundException) throw err;

      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting manga ${id}: ${errorMessage}`,
      );
      return null;
    }
  }

  async getMangaWithRelations(id: number): Promise<{
    manga: Manga;
    artisti: Artista | null;
    tags: Tag[];
    categorie: Categoria[];
    characters: { id: number; nome: string }[];
    gruppi: { id: number; nome: string }[];
    parodies: { id: number; nome: string }[];
  } | null> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Manga ID');

    const cacheKey = `manga_relations_${id}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const result =
            await this.supabaseService.getMangaWithAllRelations(id);

          if (!result?.manga) {
            throw new NotFoundException(`Manga ${id} non trovato`);
          }

          return {
            manga: result.manga,
            artisti: result.artisti ?? null,
            tags: Array.isArray(result.tags) ? [...result.tags] : [],
            categorie: Array.isArray(result.categorie)
              ? [...result.categorie]
              : [],
            characters: Array.isArray(result.characters)
              ? [...result.characters]
              : [],
            gruppi: Array.isArray(result.gruppi) ? [...result.gruppi] : [],
            parodies: Array.isArray(result.parodies)
              ? [...result.parodies]
              : [],
          };
        },
        300000,
      );
    } catch (err) {
      if (err instanceof NotFoundException) throw err;

      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting manga relations ${id}: ${errorMessage}`,
      );
      return null;
    }
  }

  async updateManga(
    id: number,
    updateData: UpdateMangaData,
    adminWallet?: string,
  ): Promise<{ success: boolean; id: number; changes: string[] }> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Manga ID');

    try {
      const existing = await this.getMangaById(id);
      if (!existing) {
        throw new NotFoundException(`Manga ${id} non trovato`);
      }

      const updatePayload: MangaUpdate = {};
      const changes: string[] = [];

      if (
        updateData.titolo !== undefined &&
        updateData.titolo !== existing.titolo
      ) {
        updatePayload.titolo = updateData.titolo;
        changes.push('titolo');
      }
      if (
        updateData.immagine !== undefined &&
        updateData.immagine !== existing.immagine
      ) {
        updatePayload.immagine = updateData.immagine;
        changes.push('immagine');
      }
      if (
        updateData.lingua !== undefined &&
        updateData.lingua !== existing.lingua
      ) {
        updatePayload.lingua = updateData.lingua;
        changes.push('lingua');
      }
      if (
        updateData.visible !== undefined &&
        updateData.visible !== existing.visible
      ) {
        updatePayload.visible = updateData.visible;
        changes.push('visible');
      }
      if (
        updateData.artista_id !== undefined &&
        updateData.artista_id !== existing.artista_id
      ) {
        updatePayload.artista_id = updateData.artista_id;
        changes.push('artista_id');
      }
      if (
        updateData.categoria_id !== undefined &&
        updateData.categoria_id !== existing.categoria_id
      ) {
        updatePayload.categoria_id = updateData.categoria_id;
        changes.push('categoria_id');
      }
      if (
        updateData.numero_pagine !== undefined &&
        updateData.numero_pagine !== existing.numero_pagine
      ) {
        updatePayload.numero_pagine = updateData.numero_pagine;
        changes.push('numero_pagine');
      }
      if (
        updateData.url_origine !== undefined &&
        updateData.url_origine !== existing.url_origine
      ) {
        updatePayload.url_origine = updateData.url_origine;
        changes.push('url_origine');
      }
      if (updateData.pagine !== undefined) {
        updatePayload.pagine =
          updateData.pagine === null ? [] : updateData.pagine;
        changes.push('pagine');
      }

      if (changes.length === 0) {
        return { success: true, id, changes: [] };
      }

      const result = await this.supabaseService.updateManga(id, updatePayload);

      if (!result.success) {
        throw result.error;
      }

      await this.invalidateCache([
        `manga_${id}`,
        `manga_relations_${id}`,
        'admin_manga_all_*',
        'system-stats',
        'quick-stats',
      ]);

      this.eventEmitter.emit('admin.manga.updated', {
        mangaId: id,
        changes,
        adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(
        `[${requestId}] ✅ Manga ${id} aggiornato: ${changes.join(', ')}`,
      );

      return { success: true, id, changes };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error updating manga ${id}: ${errorMessage}`,
      );

      if (err instanceof NotFoundException) throw err;

      throw new InternalServerErrorException('Failed to update manga');
    }
  }

  async softDeleteManga(
    id: number,
    adminWallet?: string,
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Manga ID');

    try {
      const existing = await this.getMangaById(id);
      if (!existing) {
        throw new NotFoundException(`Manga ${id} non trovato`);
      }

      if (existing.visible === false) {
        return { success: true, message: 'Manga già nascosto' };
      }

      const result = await this.supabaseService.softDeleteManga(id);

      if (!result.success) {
        throw result.error;
      }

      await this.invalidateCache([
        `manga_${id}`,
        `manga_relations_${id}`,
        'admin_manga_all_*',
        'system-stats',
        'quick-stats',
      ]);

      this.eventEmitter.emit('admin.manga.deleted', {
        mangaId: id,
        type: 'soft',
        adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(`[${requestId}] ✅ Manga ${id} nascosto`);

      return { success: true, message: 'Manga nascosto con successo' };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error soft deleting manga ${id}: ${errorMessage}`,
      );

      if (err instanceof NotFoundException) throw err;

      throw new InternalServerErrorException('Failed to soft delete manga');
    }
  }

  async hardDeleteManga(
    id: number,
    adminWallet?: string,
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Manga ID');

    try {
      const existing = await this.getMangaById(id);
      if (!existing) {
        throw new NotFoundException(`Manga ${id} non trovato`);
      }

      const result = await this.supabaseService.hardDeleteManga(id);

      if (!result.success) {
        throw result.error;
      }

      await this.invalidateCache([
        `manga_${id}`,
        `manga_relations_${id}`,
        'admin_manga_all_*',
        'system-stats',
        'quick-stats',
      ]);

      this.eventEmitter.emit('admin.manga.deleted', {
        mangaId: id,
        type: 'hard',
        adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(
        `[${requestId}] ✅ Manga ${id} eliminato definitivamente`,
      );

      return { success: true, message: 'Manga eliminato definitivamente' };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error hard deleting manga ${id}: ${errorMessage}`,
      );

      if (err instanceof NotFoundException) throw err;

      throw new InternalServerErrorException('Failed to hard delete manga');
    }
  }

  async restoreManga(
    id: number,
    adminWallet?: string,
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Manga ID');

    try {
      const existing = await this.getMangaById(id);
      if (!existing) {
        throw new NotFoundException(`Manga ${id} non trovato`);
      }

      if (existing.visible === true) {
        return { success: true, message: 'Manga già visibile' };
      }

      const result = await this.supabaseService.restoreManga(id);

      if (!result.success) {
        throw result.error;
      }

      await this.invalidateCache([
        `manga_${id}`,
        `manga_relations_${id}`,
        'admin_manga_all_*',
        'system-stats',
        'quick-stats',
      ]);

      this.eventEmitter.emit('admin.manga.restored', {
        mangaId: id,
        adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(`[${requestId}] ✅ Manga ${id} ripristinato`);

      return { success: true, message: 'Manga ripristinato con successo' };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error restoring manga ${id}: ${errorMessage}`,
      );

      if (err instanceof NotFoundException) throw err;

      throw new InternalServerErrorException('Failed to restore manga');
    }
  }

  // ============================================
  // METODI DI IMPORT
  // ============================================

  async importManga(
    url: string,
    options?: ImportOptions,
  ): Promise<ImportResult & { requestId?: string; duration?: number }> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      this.validateUrl(url);

      const result = await this.withRetry(
        () => this.importService.importFromUrl(url),
        { requestId, maxRetries: options?.priority === 'high' ? 3 : 2 },
      );

      const duration = Date.now() - startTime;

      if (result.success) {
        await this.invalidateCache([
          'admin_manga_all_*',
          'system-stats',
          'quick-stats',
        ]);

        this.eventEmitter.emit('admin.import.completed', {
          url,
          success: true,
          mangaId: result.id,
          duration,
          source: options?.source,
          requestId,
        });

        this.logger.log(
          `[${requestId}] ✅ Manga importato in ${duration}ms: ${result.title || 'Unknown'} (ID: ${result.id})`,
        );
      } else {
        this.logger.warn(
          `[${requestId}] ⚠️ Import fallito: ${url} - ${result.error}`,
        );
      }

      return { ...result, requestId, duration };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      const duration = Date.now() - startTime;

      this.logger.error(`[${requestId}] ❌ Import error: ${errorMessage}`);

      this.eventEmitter.emit('admin.import.failed', {
        url,
        error: errorMessage,
        duration,
        source: options?.source,
        requestId,
      });

      return {
        success: false,
        error: errorMessage,
        requestId,
        duration,
      };
    }
  }

  async bulkImport(
    urls: string[],
    options?: ImportOptions,
  ): Promise<BulkImportResult> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    if (!urls?.length) {
      throw new BadRequestException('La lista degli URL è obbligatoria');
    }

    if (urls.length > 100) {
      throw new BadRequestException('Massimo 100 URL per singola operazione');
    }

    const results: BulkImportResult['details'] = [];
    let successful = 0;
    let failed = 0;

    this.logger.log(
      `[${requestId}] 🚀 Avvio Bulk Import Premium: ${urls.length} URL (Priority: ${options?.priority || 'normal'})`,
    );

    const concurrency = options?.priority === 'high' ? 5 : 3;
    const batches: string[][] = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      batches.push(urls.slice(i, i + concurrency));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (url) => {
        const itemStartTime = Date.now();
        let attempts = 0;
        const maxAttempts = 2;
        let lastError = '';
        let importRes: ImportResult = { success: false };

        while (attempts < maxAttempts && !importRes.success) {
          try {
            this.validateUrl(url);
            importRes = await this.importService.importFromUrl(url);
            if (!importRes.success) {
              lastError = importRes.error || 'Errore sconosciuto';
              attempts++;
              if (attempts < maxAttempts)
                await new Promise((r) => setTimeout(r, 500));
            }
          } catch (err) {
            lastError = this.getErrorMessage(err);
            attempts++;
            if (attempts < maxAttempts)
              await new Promise((r) => setTimeout(r, 500));
          }
        }

        const duration = Date.now() - itemStartTime;

        if (importRes.success) {
          successful++;
          this.logger.log(
            `[${requestId}] ✅ [Tentativo ${attempts + 1}] Successo: ${url} (${duration}ms)`,
          );
        } else {
          failed++;
          this.logger.warn(
            `[${requestId}] ⚠️ Fallimento definitivo: ${url} - ${lastError}`,
          );
        }

        return {
          url,
          success: importRes.success,
          id: importRes.id ?? undefined,
          error: importRes.success ? undefined : lastError,
          duration,
          source: options?.source || ImportSource.OTHER,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      if (batches.indexOf(batch) < batches.length - 1) {
        const delay =
          options?.priority === 'high'
            ? 500
            : options?.priority === 'low'
              ? 3000
              : 1500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const totalDuration = Date.now() - startTime;

    await Promise.all([
      this.invalidateCache([
        'admin_manga_all_*',
        'system-stats',
        'quick-stats',
      ]),
      this.eventEmitter
        .emitAsync('admin.bulk_import.completed', {
          total: urls.length,
          successful,
          failed,
          duration: totalDuration,
          requestId,
        })
        .catch((e: Error) =>
          this.logger.error(`Errore emissione evento: ${e.message}`),
        ),
    ]);

    return {
      success: true,
      total: urls.length,
      successful,
      failed,
      details: results,
      requestId,
      duration: totalDuration,
    };
  }

  // ============================================
  // METODI PER ARTISTI, TAG, CATEGORIE
  // ============================================

  async getAllArtists(
    includeStats: boolean = false,
  ): Promise<ArtistResponse[]> {
    const requestId = this.generateRequestId();
    const cacheKey = `artists_${includeStats}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          // ✅ FIX: getAllArtists ora restituisce direttamente l'array
          const artistsData = await this.supabaseService.getAllArtists();
          const artists = artistsData.data || [];

          let result: ArtistResponse[] = artists.map((artist: Artista) => ({
            id: artist.id,
            nome: artist.nome,
            counter: artist.counter ?? 0,
          }));

          if (includeStats) {
            const enriched = await Promise.all(
              result.map(async (artist) => {
                const { data } = await this.supabaseService.supabase
                  .from('manga')
                  .select('id')
                  .eq('artista_id', artist.id);

                return {
                  ...artist,
                  mangaCount: data?.length || 0,
                };
              }),
            );
            result = enriched;
          }

          this.logger.log(`[${requestId}] Retrieved ${result.length} artists`);
          return result;
        },
        this.CACHE_TTL.artists,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting artists: ${errorMessage}`,
      );
      return [];
    }
  }

  async getAllTags(includeUsage: boolean = false): Promise<TagResponse[]> {
    const requestId = this.generateRequestId();
    const cacheKey = `tags_${includeUsage}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          // ✅ FIX: getAllTags restituisce direttamente l'array
          const tagsData = await this.supabaseService.getAllTags();
          const tags = tagsData.data || [];

          let result: TagResponse[] = tags.map((tag: Tag) => ({
            id: tag.id,
            nome: tag.nome,
            counter: tag.counter ?? 0,
          }));

          if (includeUsage && result.length > 0) {
            const tagIds = result.map((t) => t.id);

            const { data: usage, error: usageError } =
              await this.supabaseService.supabase
                .from('manga_tags')
                .select('tag_id')
                .in('tag_id', tagIds);

            if (!usageError && usage) {
              const usageCountMap = new Map<number, number>();
              usage.forEach((item: { tag_id: number }) => {
                usageCountMap.set(
                  item.tag_id,
                  (usageCountMap.get(item.tag_id) || 0) + 1,
                );
              });

              result = result.map((tag) => ({
                ...tag,
                usageCount: usageCountMap.get(tag.id) || 0,
              }));
            }
          }

          this.logger.log(`[${requestId}] Retrieved ${result.length} tags`);
          return result;
        },
        this.CACHE_TTL.tags,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(`[${requestId}] Error getting tags: ${errorMessage}`);
      return [];
    }
  }

  async getAllCategories(
    includeStats: boolean = false,
  ): Promise<CategoryResponse[]> {
    const requestId = this.generateRequestId();
    const cacheKey = `categories_${includeStats}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          // ✅ FIX: getAllCategories restituisce direttamente l'array
          const categoriesData = await this.supabaseService.getAllCategories();
          const categories = categoriesData.data || [];

          let result: CategoryResponse[] = categories.map(
            (category: Categoria) => ({
              id: category.id,
              nome: category.nome,
              counter: category.counter ?? 0,
            }),
          );

          if (includeStats && result.length > 0) {
            result = await Promise.all(
              result.map(async (category) => {
                const { count, error } = await this.supabaseService.supabase
                  .from('manga')
                  .select('*', { count: 'exact', head: true })
                  .eq('categoria_id', category.id);

                if (error) {
                  this.logger.warn(
                    `[${requestId}] Errore count per categoria ${category.id}: ${error.message}`,
                  );
                }

                return {
                  ...category,
                  mangaCount: count || 0,
                };
              }),
            );
          }

          this.logger.log(
            `[${requestId}] Retrieved ${result.length} categories`,
          );
          return result;
        },
        this.CACHE_TTL.categories,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting categories: ${errorMessage}`,
      );
      return [];
    }
  }

  async getArtistById(id: number): Promise<Artista | null> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Artist ID');

    try {
      const artist = await this.supabaseService.getArtistById(id);
      if (!artist) {
        throw new NotFoundException(`Artista ${id} non trovato`);
      }
      return artist;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;

      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting artist ${id}: ${errorMessage}`,
      );
      return null;
    }
  }

  async getTagById(id: number): Promise<Tag | null> {
    const requestId = this.generateRequestId();
    this.validateId(id, 'Tag ID');

    try {
      const tag = await this.supabaseService.getTagById(id);
      if (!tag) {
        throw new NotFoundException(`Tag ${id} non trovato`);
      }
      return tag;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;

      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting tag ${id}: ${errorMessage}`,
      );
      return null;
    }
  }

  // ============================================
  // METODI PER STATISTICHE
  // ============================================

  async getSystemStats(): Promise<SystemStats> {
    const requestId = this.generateRequestId();
    const cacheKey = 'system-stats';

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const today = new Date().toISOString().split('T')[0];
          const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();

          const [
            mangaRes,
            artistsRes,
            tagsRes,
            categoriesRes,
            usersRes,
            recentRes,
            viewsRes,
            activeRes,
          ] = await Promise.all([
            this.supabaseService.supabase
              .from('manga')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('artisti')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('tags')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('categorie')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('users')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('manga')
              .select('id', { count: 'exact', head: true })
              .gte('created_at', sevenDaysAgo.toISOString()),
            this.supabaseService.supabase
              .from('analytics_events')
              .select('*', { count: 'exact', head: true })
              .eq('event_type', 'view')
              .gte('created_at', today),
            this.supabaseService.supabase
              .from('analytics_events')
              .select('wallet_address', {
                count: 'exact',
                head: true,
              })
              .gte('created_at', fiveMinAgo),
          ]);

          const activeWallets = activeRes.data || [];
          const uniqueActiveUsers = new Set(
            activeWallets.map(
              (w: { wallet_address: string }) => w.wallet_address,
            ),
          ).size;

          this.logger.log(`[${requestId}] System stats retrieved`);

          return {
            total_manga: mangaRes.count || 0,
            total_artists: artistsRes.count || 0,
            total_tags: tagsRes.count || 0,
            total_categories: categoriesRes.count || 0,
            total_users: usersRes.count || 0,
            recent_manga: recentRes.count || 0,
            total_views_today: viewsRes.count || 0,
            active_users_now: uniqueActiveUsers,
          };
        },
        this.CACHE_TTL.systemStats,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting system stats: ${errorMessage}`,
      );

      return {
        total_manga: 0,
        total_artists: 0,
        total_tags: 0,
        total_categories: 0,
        total_users: 0,
        recent_manga: 0,
        total_views_today: 0,
        active_users_now: 0,
      };
    }
  }

  async getPopularTags(
    limit: number = 30,
    minCount: number = 1,
  ): Promise<PopularTag[]> {
    const requestId = this.generateRequestId();
    const cacheKey = `popular-tags-${limit}-${minCount}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const { data, error } = await this.supabaseService.supabase
            .from('manga_tags')
            .select('tag_id, tags!inner(nome)');

          if (error) throw error;

          const tagCountMap = new Map<string, number>();

          (data || []).forEach((item: unknown) => {
            const typedItem = item as PopularTagData;
            if (typedItem.tags?.nome) {
              const tagName = typedItem.tags.nome;
              tagCountMap.set(tagName, (tagCountMap.get(tagName) || 0) + 1);
            }
          });

          const total = Array.from(tagCountMap.values()).reduce(
            (a, b) => a + b,
            0,
          );

          const result = Array.from(tagCountMap.entries())
            .map(([nome, count]) => ({
              nome,
              count,
              percentage:
                total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
            }))
            .filter((tag) => tag.count >= minCount)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

          this.logger.log(
            `[${requestId}] Retrieved ${result.length} popular tags`,
          );
          return result;
        },
        this.CACHE_TTL.tags,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting popular tags: ${errorMessage}`,
      );
      return [];
    }
  }

  async getQuickStats(): Promise<QuickStats> {
    const requestId = this.generateRequestId();
    const cacheKey = 'quick-stats';

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const today = new Date().toISOString().split('T')[0];
          const fifteenMinutesAgo = new Date(
            Date.now() - 15 * 60000,
          ).toISOString();

          const [
            mangaRes,
            artistsRes,
            tagsRes,
            categoriesRes,
            viewsRes,
            activeRes,
            sessionsRes,
          ] = await Promise.all([
            this.supabaseService.supabase
              .from('manga')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('artisti')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('tags')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('categorie')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('analytics_events')
              .select('*', { count: 'exact', head: true })
              .eq('event_type', 'view')
              .gte('created_at', today),
            this.supabaseService.supabase
              .from('analytics_events')
              .select('wallet_address')
              .gte('created_at', fifteenMinutesAgo),
            this.supabaseService.supabase
              .from('reading_sessions')
              .select('completion_rate')
              .not('completion_rate', 'is', null)
              .limit(1000),
          ]);

          const activeWallets = activeRes.data || [];
          const uniqueActiveUsers = new Set(
            activeWallets.map(
              (w: { wallet_address: string }) => w.wallet_address,
            ),
          ).size;

          const sessions =
            (sessionsRes.data as { completion_rate: number }[]) || [];
          const avgCompletion =
            sessions.length > 0
              ? sessions.reduce((acc, s) => acc + (s.completion_rate || 0), 0) /
                sessions.length
              : 0;

          this.logger.log(`[${requestId}] Quick stats retrieved`);

          return {
            total_manga: mangaRes.count || 0,
            total_artists: artistsRes.count || 0,
            total_tags: tagsRes.count || 0,
            total_categories: categoriesRes.count || 0,
            total_views_today: viewsRes.count || 0,
            active_users: uniqueActiveUsers,
            completion_rate: Number(avgCompletion.toFixed(2)),
          };
        },
        this.CACHE_TTL.stats,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting quick stats: ${errorMessage}`,
      );

      return {
        total_manga: 0,
        total_artists: 0,
        total_tags: 0,
        total_categories: 0,
        total_views_today: 0,
        active_users: 0,
        completion_rate: 0,
      };
    }
  }

  async getImportStats(
    days: number = 30,
    format: 'json' | 'csv' = 'json',
  ): Promise<DailyStatResponse[] | string> {
    const requestId = this.generateRequestId();

    try {
      if (days > 365) {
        throw new BadRequestException('Maximum 365 days');
      }

      const cacheKey = `import-stats-${days}`;
      const stats = await this.withCache(
        cacheKey,
        () => this.supabaseService.getImportStats(days),
        300000,
      );

      const result: DailyStatResponse[] = stats.map((stat: DailyStat) => ({
        id: stat.id,
        date: stat.date || '',
        total_visits: stat.total_visits ?? 0,
        total_clicks: stat.total_clicks ?? 0,
        unique_wallets: stat.unique_wallets ?? 0,
        conversion_rate:
          stat.total_visits && stat.unique_wallets
            ? Number(
                ((stat.unique_wallets / stat.total_visits) * 100).toFixed(2),
              )
            : undefined,
      }));

      if (format === 'csv') {
        const headers = [
          'date',
          'total_visits',
          'total_clicks',
          'unique_wallets',
          'conversion_rate',
        ];
        const rows = result.map((s) =>
          [
            s.date,
            s.total_visits,
            s.total_clicks,
            s.unique_wallets,
            s.conversion_rate || '',
          ].join(','),
        );
        return [headers.join(','), ...rows].join('\n');
      }

      this.logger.log(
        `[${requestId}] Retrieved ${result.length} import stats entries`,
      );
      return result;
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting import stats: ${errorMessage}`,
      );

      if (err instanceof BadRequestException) throw err;

      return [];
    }
  }

  async getUserStats(): Promise<UserStats> {
    const requestId = this.generateRequestId();
    const cacheKey = 'user-stats';

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const stats = await this.supabaseService.getUserStats();

          const today = new Date().toISOString().split('T')[0];
          const weekAgo = new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).toISOString();
          const monthAgo = new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString();

          const [newToday, newWeek, newMonth] = await Promise.all([
            this.supabaseService.supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', today),
            this.supabaseService.supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', weekAgo),
            this.supabaseService.supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', monthAgo),
          ]);

          this.logger.log(`[${requestId}] User stats retrieved`);

          return {
            total_users: stats.total_users,
            active_today: stats.active_today,
            active_week: stats.active_week,
            active_month: stats.active_month,
            google_users: stats.google_users,
            wallet_users: 0,
            email_users: 0,
            new_users_today: newToday.count || 0,
            new_users_week: newWeek.count || 0,
            new_users_month: newMonth.count || 0,
          };
        },
        this.CACHE_TTL.stats,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting user stats: ${errorMessage}`,
      );

      return {
        total_users: 0,
        active_today: 0,
        active_week: 0,
        active_month: 0,
        google_users: 0,
        wallet_users: 0,
        email_users: 0,
        new_users_today: 0,
        new_users_week: 0,
        new_users_month: 0,
      };
    }
  }

  // ============================================
  // METODI PER UTENTI
  // ============================================

  async getAllUsers(
    page: number = 1,
    limit: number = 100,
    filters?: {
      role?: UserRole;
      isActive?: boolean;
      search?: string;
      provider?: string;
    },
  ): Promise<PaginatedResponse<User>> {
    const requestId = this.generateRequestId();

    try {
      const pageNum = Math.max(1, page);
      const limitNum = Math.min(1000, Math.max(1, limit));
      const offset = (pageNum - 1) * limitNum;

      let query = this.supabaseService.supabase
        .from('users')
        .select('*', { count: 'exact' });

      if (filters?.role) {
        query = query.eq('role', filters.role);
      }

      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters?.provider) {
        query = query.eq('provider', filters.provider);
      }

      if (filters?.search) {
        query = query.or(
          `email.ilike.%${filters.search}%,name.ilike.%${filters.search}%`,
        );
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limitNum);

      this.logger.log(`[${requestId}] Retrieved ${data?.length || 0} users`);

      return {
        data: data || [],
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(`[${requestId}] Error getting users: ${errorMessage}`);

      return this.emptyPaginatedResponse<User>(page, limit);
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    const requestId = this.generateRequestId();

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    try {
      const user = await this.supabaseService.getUserById(userId);

      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }

      this.logger.log(`[${requestId}] Retrieved user ${userId}`);
      return user;
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }

      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting user ${userId}: ${errorMessage}`,
      );
      return null;
    }
  }

  async updateUserRole(
    userId: string,
    role: UserRole,
    adminWallet?: string,
  ): Promise<User> {
    const requestId = this.generateRequestId();

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }

      const updated = await this.supabaseService.updateUserRole(userId, role);

      if (!updated) {
        throw new InternalServerErrorException('Failed to update user role');
      }

      await this.invalidateCache([`user_${userId}`, 'user-stats']);

      this.eventEmitter.emit('admin.user.role_updated', {
        userId,
        oldRole: user.role,
        newRole: role,
        adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(
        `[${requestId}] ✅ User role updated: ${userId} -> ${role}`,
      );

      return updated;
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error updating user role ${userId}: ${errorMessage}`,
      );

      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }

      throw new InternalServerErrorException('Failed to update user role');
    }
  }

  async setUserActive(
    userId: string,
    isActive: boolean,
    adminWallet?: string,
  ): Promise<User> {
    const requestId = this.generateRequestId();

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }

      const updated = await this.supabaseService.setUserActive(
        userId,
        isActive,
      );

      if (!updated) {
        throw new InternalServerErrorException('Failed to update user status');
      }

      await this.invalidateCache([`user_${userId}`, 'user-stats']);

      this.eventEmitter.emit('admin.user.status_updated', {
        userId,
        wasActive: user.is_active,
        isActive,
        adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(
        `[${requestId}] ✅ User status updated: ${userId} -> ${isActive ? 'active' : 'inactive'}`,
      );

      return updated;
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error updating user status ${userId}: ${errorMessage}`,
      );

      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }

      throw new InternalServerErrorException('Failed to update user status');
    }
  }

  // ============================================
  // METODI PER ADMIN USERS (WALLET-BASED)
  // ============================================

  async getAdminUsers(
    includeDetails: boolean = false,
  ): Promise<AdminUserResponse[]> {
    const requestId = this.generateRequestId();
    const cacheKey = `admin-users-${includeDetails}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          // ✅ FIX: getAdminUsers restituisce un PaginatedResult
          const adminsData = await this.supabaseService.getAdminUsers();
          const admins = adminsData.data || [];

          let result: AdminUserResponse[] = admins.map((admin: AdminUser) => ({
            id: admin.id,
            wallet_address: admin.wallet_address,
            username: admin.username,
            ultimo_accesso: admin.ultimo_accesso,
          }));

          if (includeDetails) {
            const enriched = await Promise.all(
              result.map(async (admin): Promise<AdminUserResponse> => {
                const user = await this.supabaseService.findUserByWallet(
                  admin.wallet_address,
                );
                return {
                  ...admin,
                  // ✅ FIX: Converti null a undefined per compatibilità
                  last_login:
                    user?.last_login ?? admin.ultimo_accesso ?? undefined,
                  created_at: user?.created_at ?? undefined,
                };
              }),
            );
            result = enriched;
          }

          this.logger.log(
            `[${requestId}] Retrieved ${result.length} admin users`,
          );
          return result;
        },
        300000,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting admin users: ${errorMessage}`,
      );
      return [];
    }
  }

  async addAdminWallet(
    walletAddress: string,
    username?: string,
    adminWallet?: string,
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();

    try {
      const normalized = this.validateWallet(walletAddress);

      const exists = await this.supabaseService.isAdminWallet(normalized);
      if (exists) {
        return {
          success: true,
          message: 'Wallet already in admin list',
        };
      }

      const result = await this.supabaseService.addAdminWallet(
        normalized,
        username,
      );

      if (!result) {
        throw new InternalServerErrorException('Failed to add admin wallet');
      }

      await this.invalidateCache(['admin-users-*']);

      this.eventEmitter.emit('admin.wallet.added', {
        wallet: normalized,
        username,
        addedBy: adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(`[${requestId}] ✅ Admin wallet added: ${normalized}`);

      return {
        success: true,
        message: 'Admin wallet added successfully',
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error adding admin wallet: ${errorMessage}`,
      );

      if (err instanceof BadRequestException) {
        throw err;
      }

      throw new InternalServerErrorException('Failed to add admin wallet');
    }
  }

  async removeAdminWallet(
    walletAddress: string,
    adminWallet?: string,
  ): Promise<{ success: boolean; message: string }> {
    const requestId = this.generateRequestId();

    try {
      const normalized = this.validateWallet(walletAddress);

      const result = await this.supabaseService.removeAdminWallet(normalized);

      if (!result) {
        throw new NotFoundException('Admin wallet not found');
      }

      await this.invalidateCache(['admin-users-*']);

      this.eventEmitter.emit('admin.wallet.removed', {
        wallet: normalized,
        removedBy: adminWallet,
        timestamp: new Date().toISOString(),
        requestId,
      });

      this.logger.log(`[${requestId}] ✅ Admin wallet removed: ${normalized}`);

      return {
        success: true,
        message: 'Admin wallet removed successfully',
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error removing admin wallet: ${errorMessage}`,
      );

      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }

      throw new InternalServerErrorException('Failed to remove admin wallet');
    }
  }

  async updateAdminLastAccess(walletAddress: string): Promise<void> {
    try {
      await this.supabaseService.updateAdminLastAccess(walletAddress);
    } catch (err) {
      this.logger.warn(
        `Failed to update admin last access: ${this.getErrorMessage(err)}`,
      );
    }
  }

  // ============================================
  // METODI PER VOTI E BOOKMARK
  // ============================================

  async getAllVotes(
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedResponse<Vote>> {
    const requestId = this.generateRequestId();

    try {
      const pageNum = Math.max(1, page);
      const limitNum = Math.min(1000, Math.max(1, limit));
      const offset = (pageNum - 1) * limitNum;

      const { data, error, count } = await this.supabaseService.supabase
        .from('votes')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limitNum);

      this.logger.log(`[${requestId}] Retrieved ${data?.length || 0} votes`);

      return {
        data: data || [],
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(`[${requestId}] Error getting votes: ${errorMessage}`);

      return this.emptyPaginatedResponse<Vote>(page, limit);
    }
  }

  async getAllBookmarks(
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedResponse<Bookmark>> {
    const requestId = this.generateRequestId();

    try {
      const pageNum = Math.max(1, page);
      const limitNum = Math.min(1000, Math.max(1, limit));
      const offset = (pageNum - 1) * limitNum;

      const { data, error, count } = await this.supabaseService.supabase
        .from('bookmarks')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limitNum);

      this.logger.log(
        `[${requestId}] Retrieved ${data?.length || 0} bookmarks`,
      );

      return {
        data: data || [],
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting bookmarks: ${errorMessage}`,
      );

      return this.emptyPaginatedResponse<Bookmark>(page, limit);
    }
  }

  async getAllComments(
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedResponse<Comment>> {
    const requestId = this.generateRequestId();

    try {
      const pageNum = Math.max(1, page);
      const limitNum = Math.min(1000, Math.max(1, limit));
      const offset = (pageNum - 1) * limitNum;

      const { data, error, count } = await this.supabaseService.supabase
        .from('comments')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limitNum);

      this.logger.log(`[${requestId}] Retrieved ${data?.length || 0} comments`);

      return {
        data: data || [],
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting comments: ${errorMessage}`,
      );

      return this.emptyPaginatedResponse<Comment>(page, limit);
    }
  }

  async getAllReadingSessions(
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedResponse<ReadingSession>> {
    const requestId = this.generateRequestId();

    try {
      const pageNum = Math.max(1, page);
      const limitNum = Math.min(1000, Math.max(1, limit));
      const offset = (pageNum - 1) * limitNum;

      const { data, error, count } = await this.supabaseService.supabase
        .from('reading_sessions')
        .select('*', { count: 'exact' })
        .order('start_time', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limitNum);

      this.logger.log(
        `[${requestId}] Retrieved ${data?.length || 0} reading sessions`,
      );

      return {
        data: data || [],
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting reading sessions: ${errorMessage}`,
      );

      return this.emptyPaginatedResponse<ReadingSession>(page, limit);
    }
  }

  // ============================================
  // METODI PER ANALYTICS
  // ============================================

  async getAllAnalyticsEvents(
    page: number = 1,
    limit: number = 100,
    eventType?: string,
  ): Promise<PaginatedResponse<AnalyticsEvent>> {
    const requestId = this.generateRequestId();

    try {
      const pageNum = Math.max(1, page);
      const limitNum = Math.min(1000, Math.max(1, limit));
      const offset = (pageNum - 1) * limitNum;

      let query = this.supabaseService.supabase
        .from('analytics_events')
        .select('*', { count: 'exact' });

      if (eventType) {
        query = query.eq('event_type', eventType);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limitNum);

      this.logger.log(
        `[${requestId}] Retrieved ${data?.length || 0} analytics events`,
      );

      return {
        data: data || [],
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting analytics events: ${errorMessage}`,
      );

      return this.emptyPaginatedResponse<AnalyticsEvent>(page, limit);
    }
  }

  async getEventStats(days: number = 30): Promise<EventStatsResponse> {
    const requestId = this.generateRequestId();
    const cacheKey = `event-stats-${days}`;

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const stats = await this.supabaseService.getEventStats();

          const dayAgo = new Date(
            Date.now() - 24 * 60 * 60 * 1000,
          ).toISOString();
          const { data: hourlyData } = await this.supabaseService.supabase
            .from('analytics_events')
            .select('created_at')
            .gte('created_at', dayAgo);

          const byHour = new Array(24).fill(0);
          (hourlyData || []).forEach((item: { created_at: string }) => {
            const hour = new Date(item.created_at).getHours();
            byHour[hour]++;
          });

          const total =
            stats.views +
            stats.clicks +
            stats.voteUp +
            stats.voteDown +
            stats.other;

          this.logger.log(`[${requestId}] Event stats retrieved`);

          return {
            ...stats,
            total,
            byHour,
          };
        },
        this.CACHE_TTL.eventStats,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting event stats: ${errorMessage}`,
      );

      return {
        views: 0,
        clicks: 0,
        voteUp: 0,
        voteDown: 0,
        other: 0,
        total: 0,
      };
    }
  }

  // ============================================
  // METODI DI MANUTENZIONE
  // ============================================

  clearMetadataCache(): { success: boolean; message: string } {
    this.supabaseService.clearMetadataCache();
    this.logger.log('🧹 Cache metadata pulita');

    return {
      success: true,
      message: 'Cache metadata pulita con successo',
    };
  }

  async runGlobalRepair(
    mangaList?: MangaRepairItem[],
    options?: RepairOptions,
  ): Promise<{
    total: number;
    fixed: number;
    failed: number;
    details: Array<{ id: number; status: RepairStatus; server?: string }>;
  }> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    const servers = options?.servers || this.SERVER_VARIANTS;
    const timeout = options?.timeout || 3000;
    const dryRun = options?.dryRun || false;
    const concurrency = options?.concurrency || 5;

    try {
      let items = mangaList;
      if (!items) {
        const allManga = await this.getAllMangaAdmin(true);
        items = (allManga || []).map((manga: Manga) => ({
          id: manga.id,
          immagine: manga.immagine,
          titolo: manga.titolo,
          status: RepairStatus.UNKNOWN,
        }));
      }

      this.logger.log(
        `[${requestId}] 🔧 Avvio riparazione globale per ${items.length} manga (Dry Run: ${dryRun})`,
      );

      const results: Array<{
        id: number;
        status: RepairStatus;
        server?: string;
      }> = [];
      let fixedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);

        const batchResults = await Promise.all(
          batch.map(async (manga) => {
            if (!manga?.immagine) {
              return { id: manga.id, status: RepairStatus.UNKNOWN };
            }

            let status: RepairStatus = RepairStatus.BROKEN;
            let currentServer = this.extractServer(manga.immagine);
            let finalUrl = manga.immagine;

            try {
              const check = await axios.head(manga.immagine, {
                timeout,
                headers: { Referer: 'https://hentaifox.com/' },
              });

              if (check.status === 200) {
                return {
                  id: manga.id,
                  status: RepairStatus.WORKING,
                  server: currentServer,
                };
              }
            } catch {
              // Prova altri server
            }

            // ✅ FIX: Itera sui server solo se il check principale fallisce
            if (status === RepairStatus.BROKEN) {
              for (const s of servers) {
                try {
                  const testUrl = manga.immagine.replace(
                    /(i\d+|t\d*)\./,
                    `${s}.`,
                  );

                  const check = await axios.head(testUrl, {
                    timeout,
                    headers: { Referer: 'https://hentaifox.com/' },
                  });

                  if (check.status === 200) {
                    currentServer = s;
                    status = RepairStatus.FIXED;
                    finalUrl = testUrl;

                    if (!dryRun) {
                      const { error: updateError } =
                        await this.supabaseService.supabase
                          .from('manga')
                          .update({ immagine: finalUrl } as never)
                          .eq('id', manga.id);

                      if (updateError) {
                        this.logger.error(
                          `[${requestId}] Errore update manga ${manga.id}: ${updateError.message}`,
                        );
                        status = RepairStatus.BROKEN;
                      }
                    }
                    break;
                  }
                } catch {
                  continue;
                }
              }
            }

            return { id: manga.id, status, server: currentServer };
          }),
        );

        results.push(...batchResults);

        batchResults.forEach((r) => {
          if (r.status === RepairStatus.FIXED) fixedCount++;
          if (r.status === RepairStatus.BROKEN) failedCount++;
        });

        if (i + concurrency < items.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      const duration = Date.now() - startTime;

      if (!dryRun) {
        await this.invalidateCache(['admin_manga_all_*']);
      }

      this.eventEmitter.emit('admin.repair.completed', {
        total: items.length,
        fixed: fixedCount,
        failed: failedCount,
        duration,
        dryRun,
        requestId,
      });

      this.logger.log(
        `[${requestId}] ✅ Manutenzione finita: ${fixedCount} riparati, ${failedCount} falliti in ${duration}ms`,
      );

      return {
        total: items.length,
        fixed: fixedCount,
        failed: failedCount,
        details: results,
      };
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] ❌ Global repair failed: ${errorMessage}`,
      );
      throw new InternalServerErrorException('Repair operation failed');
    }
  }

  // ============================================
  // METODI DI GESTIONE TAG PER MANGA
  // ============================================

  async addTagToManga(
    mangaId: number,
    tagId: number,
    adminWallet?: string,
  ): Promise<boolean> {
    const requestId = this.generateRequestId();
    this.validateId(mangaId, 'Manga ID');
    this.validateId(tagId, 'Tag ID');

    try {
      const result = await this.supabaseService.addTagToManga(mangaId, tagId);

      if (result.success) {
        await this.invalidateCache([`manga_relations_${mangaId}`]);

        this.eventEmitter.emit('admin.tag.added', {
          mangaId,
          tagId,
          adminWallet,
          timestamp: new Date().toISOString(),
          requestId,
        });

        this.logger.log(
          `[${requestId}] ✅ Tag ${tagId} added to manga ${mangaId}`,
        );
      }

      return result.success;
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error adding tag to manga: ${errorMessage}`,
      );
      return false;
    }
  }

  async removeTagFromManga(
    mangaId: number,
    tagId: number,
    adminWallet?: string,
  ): Promise<boolean> {
    const requestId = this.generateRequestId();
    this.validateId(mangaId, 'Manga ID');
    this.validateId(tagId, 'Tag ID');

    try {
      const result = await this.supabaseService.removeTagFromManga(
        mangaId,
        tagId,
      );

      if (result.success) {
        await this.invalidateCache([`manga_relations_${mangaId}`]);

        this.eventEmitter.emit('admin.tag.removed', {
          mangaId,
          tagId,
          adminWallet,
          timestamp: new Date().toISOString(),
          requestId,
        });

        this.logger.log(
          `[${requestId}] ✅ Tag ${tagId} removed from manga ${mangaId}`,
        );
      }

      return result.success;
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error removing tag from manga: ${errorMessage}`,
      );
      return false;
    }
  }

  // ============================================
  // METODI DI HEALTH CHECK
  // ============================================

  async healthCheck(): Promise<HealthCheckResponse> {
    const requestId = this.generateRequestId();
    const start = Date.now();

    try {
      const [dbHealthy] = await Promise.all([
        this.supabaseService.checkHealth(),
      ]);

      const responseTime = Date.now() - start;

      const status: 'ok' | 'degraded' | 'error' = dbHealthy ? 'ok' : 'error';

      this.logger.log(
        `[${requestId}] Health check: ${status} (${responseTime}ms)`,
      );

      return {
        status,
        services: {
          database: dbHealthy ? 'up' : 'down',
          import: 'up',
          storage: 'up',
        },
        metrics: {
          responseTime,
          activeRequests: 0,
          uptime: process.uptime(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error(
        `[${requestId}] Health check failed: ${this.getErrorMessage(err)}`,
      );

      return {
        status: 'error',
        services: {
          database: 'down',
          import: 'down',
          storage: 'down',
        },
        metrics: {
          responseTime: Date.now() - start,
          activeRequests: 0,
          uptime: process.uptime(),
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getDatabaseStats(): Promise<DatabaseStatsResponse | null> {
    const requestId = this.generateRequestId();
    const cacheKey = 'database-stats';

    try {
      return await this.withCache(
        cacheKey,
        async () => {
          const stats = await this.supabaseService.getDatabaseStats();

          const [sessionsCount, analyticsCount] = await Promise.all([
            this.supabaseService.supabase
              .from('reading_sessions')
              .select('*', { count: 'exact', head: true }),
            this.supabaseService.supabase
              .from('analytics_events')
              .select('*', { count: 'exact', head: true }),
          ]);

          this.logger.log(`[${requestId}] Database stats retrieved`);

          return {
            ...stats,
            totalReadingSessions: sessionsCount.count || 0,
            totalAnalyticsEvents: analyticsCount.count || 0,
            lastUpdated: new Date().toISOString(),
          };
        },
        this.CACHE_TTL.databaseStats,
      );
    } catch (err) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(
        `[${requestId}] Error getting database stats: ${errorMessage}`,
      );
      return null;
    }
  }

  async testConnection(): Promise<TestConnectionResponse> {
    const requestId = this.generateRequestId();
    const start = Date.now();

    try {
      const result = await this.supabaseService.testConnection();
      const latency = Date.now() - start;

      this.logger.log(
        `[${requestId}] Connection test: ${result.success ? 'OK' : 'FAIL'} (${latency}ms)`,
      );

      return {
        ...result,
        latency,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - start;
      const errorMessage = this.getErrorMessage(err);

      this.logger.error(
        `[${requestId}] Connection test failed: ${errorMessage}`,
      );

      return {
        success: false,
        message: 'Connection failed',
        latency,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
