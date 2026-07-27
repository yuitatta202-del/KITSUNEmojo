import {
  Controller,
  Post,
  Body,
  Query,
  Logger,
  Get,
  Put,
  Delete,
  Param,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
  Version,
  Header,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import {
  Manga,
  MangaWithRelations,
  MangaFilterOptions as ServiceMangaFilterOptions,
  UpdateResult,
  PaginatedResult,
  HealthCheckResponse,
  Artista,
  Tag,
  Categoria,
  MangaUpdate,
  MangaStats as ServiceMangaStats,
  TableName,
  EventType,
} from './supabase.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ============================================
// ENUM E COSTANTI
// ============================================

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum MangaSortField {
  TITOLO = 'titolo',
  CREATED_AT = 'created_at',
  UP_VOTES = 'up_votes',
  DOWN_VOTES = 'down_votes',
  VIEWS = 'views',
}

// ============================================
// DTOs (Data Transfer Objects)
// ============================================

class UpdateMangaPayload {
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

class DeleteResult {
  success: boolean;
  message?: string;
  requestId?: string;
}

class MangaFilterOptions {
  visible?: boolean;
  artista_id?: number;
  categoria_id?: number;
  tag_id?: number;
  search?: string;
  limit?: number;
  offset?: number;
  page?: number;
  orderBy?: MangaSortField;
  orderDirection?: SortOrder;
}

class MangaListResponse {
  data: MangaWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

class MangaStatsResponse {
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
  daily_stats?: {
    date: string;
    views: number;
    unique_readers: number;
    completions: number;
  }[];
  trending_score?: number;
}

class ArtistaResponse {
  id: number;
  nome: string;
  counter?: number;
  mangaCount?: number;
}

class CategoriaResponse {
  id: number;
  nome: string;
  counter?: number;
  mangaCount?: number;
}

class TagResponse {
  id: number;
  nome: string;
  counter?: number;
  usageCount?: number;
}

class ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  timestamp: string;
  path?: string;
  requestId?: string;
}

class SuccessResponse {
  success: boolean;
  message: string;
  id?: number;
  requestId?: string;
  timestamp?: string;
}

class HealthResponse {
  status: 'ok' | 'degraded' | 'error' = 'ok';
  timestamp: string = '';
  services: {
    database: 'up' | 'down';
    cache: 'up' | 'down';
  } = {
    database: 'up',
    cache: 'up',
  };
  latency: number = 0;
}

class TestConnectionResponse {
  success: boolean = false;
  message: string = '';
  count?: number;
  latency?: number;
  timestamp?: string;
}

// Interfaccia per errori con codice
interface ErrorWithCode {
  code?: string;
  message?: string;
}

// ============================================
// CONTROLLER PRINCIPALE - VERSIONE CARROARMATO
// ============================================

@ApiTags('Supabase Database')
@Controller({
  path: 'supabase',
  version: '1',
})
@UseGuards(ThrottlerGuard)
@UseInterceptors(ClassSerializerInterceptor, CacheInterceptor)
export class SupabaseController {
  private readonly logger = new Logger(SupabaseController.name);
  private readonly startTime: number = Date.now();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // ENDPOINT DI TEST E MONITORAGGIO
  // ============================================

  /**
   * GET /supabase/test
   * Test connessione al database
   */
  @Get('test')
  @Version('1')
  @ApiOperation({ summary: 'Test connessione database' })
  @ApiResponse({
    status: 200,
    description: 'Test completato',
    type: TestConnectionResponse,
  })
  @ApiResponse({ status: 500, description: 'Errore di connessione' })
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @CacheTTL(0) // No caching per questo endpoint
  async testConnection(): Promise<TestConnectionResponse> {
    const requestId = this.generateRequestId();
    const start = Date.now();

    try {
      this.logger.log(`[${requestId}] Testing database connection`);

      const result = await this.supabaseService.testConnection();
      const latency = Date.now() - start;

      this.eventEmitter.emit('supabase.test', {
        success: result.success,
        latency,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return {
        ...result,
        latency,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Test connection failed: ${errorMessage}`,
      );

      return {
        success: false,
        message: `Test fallito: ${errorMessage}`,
        latency: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /supabase/health
   * Health check dettagliato
   */
  @Get('health')
  @Version('1')
  @ApiOperation({ summary: 'Health check dettagliato' })
  @ApiResponse({
    status: 200,
    description: 'Health status',
    type: HealthResponse,
  })
  @Throttle({ default: { limit: 20, ttl: 60 } })
  @CacheTTL(10) // Cache 10 secondi
  async healthCheck(): Promise<HealthResponse> {
    const start = Date.now();

    try {
      const health = await this.supabaseService.checkHealth();

      return {
        status: health.status,
        timestamp: health.timestamp,
        services: {
          database: health.tables?.manga ? 'up' : 'down',
          cache: 'up',
        },
        latency: health.latency,
      };
    } catch (error) {
      const latency = Date.now() - start;
      this.logger.error(`Health check failed: ${this.getErrorMessage(error)}`);

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        services: {
          database: 'down',
          cache: 'down',
        },
        latency,
      };
    }
  }

  /**
   * GET /supabase/stats
   * Statistiche database complete
   */
  @Get('stats')
  @Version('1')
  @ApiOperation({ summary: 'Statistiche database' })
  @ApiResponse({ status: 200, description: 'Statistiche recuperate' })
  @Throttle({ default: { limit: 30, ttl: 60 } })
  @CacheTTL(60) // Cache 1 minuto
  async getDatabaseStats() {
    const requestId = this.generateRequestId();

    try {
      this.logger.log(`[${requestId}] Retrieving database stats`);

      const stats = await this.supabaseService.getDatabaseStats();

      return {
        ...stats,
        requestId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`[${requestId}] Error getting stats: ${errorMessage}`);

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero delle statistiche',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /supabase/status
   * Status generale del servizio
   */
  @Get('status')
  @Version('1')
  @ApiOperation({ summary: 'Status generale del servizio' })
  @ApiResponse({ status: 200, description: 'Status recuperato' })
  @Throttle({ default: { limit: 60, ttl: 60 } })
  getStatus() {
    return {
      service: 'supabase',
      status: 'operational',
      uptime: (Date.now() - this.startTime) / 1000,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  // ============================================
  // ENDPOINT DI LETTURA MANGA
  // ============================================

  /**
   * GET /supabase/manga
   * Recupera tutti i manga con filtri e paginazione
   */
  @Get('manga')
  @Version('1')
  @ApiOperation({ summary: 'Recupera manga con filtri e paginazione' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'tag_id', required: false, type: Number })
  @ApiQuery({ name: 'artista_id', required: false, type: Number })
  @ApiQuery({ name: 'categoria_id', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Lista manga',
    type: MangaListResponse,
  })
  @Throttle({ default: { limit: 100, ttl: 60 } })
  @CacheTTL(30) // Cache 30 secondi
  async getAll(
    @Query() filters: MangaFilterOptions,
    @Query('page', new DefaultValuePipe(1)) page: number = 1,
    @Query('limit', new DefaultValuePipe(20)) limit: number = 20,
  ): Promise<MangaListResponse> {
    const requestId = this.generateRequestId();

    this.logger.log(`[${requestId}] 📋 Recupero manga con filtri:`, {
      ...filters,
      page,
      limit,
    });

    try {
      const validatedPage = Math.max(1, Number(page) || 1);
      const validatedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const offset = (validatedPage - 1) * validatedLimit;

      const serviceFilters: ServiceMangaFilterOptions = {
        visible: filters.visible,
        artista_id: filters.artista_id,
        categoria_id: filters.categoria_id,
        tag_id: filters.tag_id,
        search: filters.search,
        limit: validatedLimit,
        offset,
        orderBy: filters.orderBy as any,
        orderDirection: filters.orderDirection,
      };

      const result =
        await this.supabaseService.getMangaWithFilters(serviceFilters);

      // ✅ Usa result.total invece di result.count
      const data = result.data || [];
      const total = result.total;
      const totalPages = Math.ceil(total / validatedLimit);

      this.eventEmitter.emit('manga.list', {
        count: data.length,
        total,
        page: validatedPage,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return {
        data: data as MangaWithRelations[],
        total,
        page: validatedPage,
        limit: validatedLimit,
        totalPages,
        hasNext: validatedPage < totalPages,
        hasPrevious: validatedPage > 1,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore recupero manga: ${errorMessage}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero dei manga',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /supabase/manga/:id
   * Recupera un manga per ID
   */
  @Get('manga/:id')
  @Version('1')
  @ApiOperation({ summary: 'Recupera manga per ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Manga trovato' })
  @ApiResponse({ status: 404, description: 'Manga non trovato' })
  @Throttle({ default: { limit: 100, ttl: 60 } })
  @CacheTTL(60) // Cache 1 minuto
  async getMangaById(@Param('id', ParseIntPipe) id: number): Promise<Manga> {
    const requestId = this.generateRequestId();

    this.logger.log(`[${requestId}] 📋 Recupero manga ID: ${id}`);

    try {
      const manga = await this.supabaseService.getMangaById(id);

      if (!manga) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${id} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      return manga;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore recupero manga ${id}: ${errorMessage}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero del manga',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /supabase/manga/:id/details
   * Recupera dettagli completi di un manga
   */
  @Get('manga/:id/details')
  @Version('1')
  @ApiOperation({ summary: 'Recupera dettagli completi manga' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Dettagli recuperati' })
  @ApiResponse({ status: 404, description: 'Manga non trovato' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  @CacheTTL(120) // Cache 2 minuti
  async getMangaWithDetails(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MangaWithRelations> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 📋 Recupero dettagli completi manga ID: ${id}`,
    );

    try {
      const result = await this.supabaseService.getMangaWithAllRelations(id);

      if (!result.manga) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${id} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const mangaWithRelations: MangaWithRelations = {
        id: result.manga.id,
        titolo: result.manga.titolo,
        immagine: result.manga.immagine || null,
        lingua: result.manga.lingua ?? 'English',
        numero_pagine: result.manga.numero_pagine || null,
        created_at: result.manga.created_at,
        url_origine: result.manga.url_origine || null,
        pagine: result.manga.pagine || [],
        visible:
          result.manga.visible === undefined ? true : result.manga.visible,
        categoria_id: result.manga.categoria_id || null,
        artista_id: result.manga.artista_id || null,
        up_votes: result.manga.up_votes ?? 0,
        down_votes: result.manga.down_votes ?? 0,

        artisti: result.artisti
          ? {
              id: result.artisti.id,
              nome: result.artisti.nome,
              counter: result.artisti.counter,
            }
          : null,

        categorie: result.categorie
          ? {
              id: result.categorie.id,
              nome: result.categorie.nome,
              counter: result.categorie.counter,
            }
          : null,

        tags: (result.tags || []).map((tag) => ({
          id: tag.id,
          nome: tag.nome,
          counter: tag.counter,
        })),

        characters: (result.characters || []).map((char) => ({
          id: char.id,
          nome: char.nome,
          counter: char.counter,
        })),

        parodies: (result.parodies || []).map((parody) => ({
          id: parody.id,
          nome: parody.nome,
          counter: parody.counter,
        })),

        gruppi: (result.gruppi || []).map((gruppo) => ({
          id: gruppo.id,
          nome: gruppo.nome,
          counter: gruppo.counter,
        })),
      };

      this.eventEmitter.emit('manga.details', {
        mangaId: id,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return mangaWithRelations;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore dettagli manga ${id}: ${errorMessage}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero dei dettagli del manga',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /supabase/manga/:id/stats
   * Recupera statistiche di un manga
   */
  @Get('manga/:id/stats')
  @Version('1')
  @ApiOperation({ summary: 'Recupera statistiche manga' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Statistiche recuperate',
    type: MangaStatsResponse,
  })
  @ApiResponse({ status: 404, description: 'Manga non trovato' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  @CacheTTL(300) // Cache 5 minuti
  async getMangaStats(
    @Param('id', ParseIntPipe) id: number,
    @Query('days', new DefaultValuePipe(30)) days: number = 30,
  ): Promise<MangaStatsResponse> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 📊 Recupero statistiche manga ID: ${id} (ultimi ${days} giorni)`,
    );

    try {
      const validatedDays = Math.min(365, Math.max(1, Number(days) || 30));

      const stats = await this.supabaseService.getMangaStatistics(
        id,
        validatedDays,
      );

      if (!stats) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${id} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Calcola trending score (esempio: views per giorno)
      const trendingScore = stats.total_views / validatedDays;

      return {
        ...stats,
        trending_score: trendingScore,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore statistiche manga ${id}: ${errorMessage}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero delle statistiche',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // ENDPOINT PER METADATA (TAGS, ARTISTI, CATEGORIE)
  // ============================================

  /**
   * GET /supabase/tags
   * Recupera tutti i tag
   */
  @Get('tags')
  @Version('1')
  @ApiOperation({ summary: 'Recupera tutti i tag' })
  @ApiQuery({ name: 'includeUsage', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista tag' })
  @Throttle({ default: { limit: 100, ttl: 60 } })
  @CacheTTL(300) // Cache 5 minuti
  async getAllTags(
    @Query('includeUsage') includeUsage?: string,
    @Query('page', new DefaultValuePipe(1)) page: number = 1,
    @Query('limit', new DefaultValuePipe(50)) limit: number = 50,
  ): Promise<{
    data: TagResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 🏷️ Recupero tags (page: ${page}, limit: ${limit})`,
    );

    try {
      const validatedPage = Math.max(1, Number(page) || 1);
      const validatedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

      // ✅ Estrai array dal PaginatedResult
      const paginatedResult = await this.supabaseService.getAllTags();
      const tags = paginatedResult?.data ?? [];

      let result: TagResponse[] = tags.map((tag) => ({
        id: tag.id,
        nome: tag.nome,
        counter: tag.counter ?? 0,
      }));

      const total = result.length;

      // Paginazione manuale
      const offset = (validatedPage - 1) * validatedLimit;
      result = result.slice(offset, offset + validatedLimit);

      if (includeUsage === 'true' && result.length > 0) {
        const tagIds = result.map((t) => t.id);
        const { data } = await this.supabaseService.supabase
          .from('manga_tags')
          .select('tag_id')
          .in('tag_id', tagIds);

        if (data) {
          const usageCount = new Map<number, number>();
          (data as { tag_id: number }[]).forEach((item) => {
            usageCount.set(item.tag_id, (usageCount.get(item.tag_id) || 0) + 1);
          });
          result = result.map((tag) => ({
            ...tag,
            usageCount: usageCount.get(tag.id) || 0,
          }));
        }
      }

      return {
        data: result,
        total,
        page: validatedPage,
        limit: validatedLimit,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`[${requestId}] Errore recupero tags: ${errorMessage}`);

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero dei tags',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /supabase/artists
   * Recupera tutti gli artisti
   */
  @Get('artists')
  @Version('1')
  @ApiOperation({ summary: 'Recupera tutti gli artisti' })
  @ApiQuery({ name: 'includeStats', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista artisti' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  @CacheTTL(300) // Cache 5 minuti
  async getAllArtists(
    @Query('includeStats') includeStats?: string,
    @Query('page', new DefaultValuePipe(1)) page: number = 1,
    @Query('limit', new DefaultValuePipe(50)) limit: number = 50,
  ): Promise<{
    data: ArtistaResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 🎨 Recupero artisti (page: ${page}, limit: ${limit})`,
    );

    try {
      const validatedPage = Math.max(1, Number(page) || 1);
      const validatedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

      // ✅ Estrai array dal PaginatedResult
      const paginatedResult = await this.supabaseService.getAllArtists();
      const artists = paginatedResult?.data ?? [];

      let result: ArtistaResponse[] = artists.map((artist) => ({
        id: artist.id,
        nome: artist.nome,
        counter: artist.counter ?? 0,
      }));

      const total = result.length;

      // Paginazione manuale
      const offset = (validatedPage - 1) * validatedLimit;
      result = result.slice(offset, offset + validatedLimit);

      if (includeStats === 'true' && result.length > 0) {
        result = await Promise.all(
          result.map(async (artist) => {
            const { count } = await this.supabaseService.supabase
              .from('manga')
              .select('*', { count: 'exact', head: true })
              .eq('artista_id', artist.id);
            return { ...artist, mangaCount: count ?? 0 };
          }),
        );
      }

      return {
        data: result,
        total,
        page: validatedPage,
        limit: validatedLimit,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore recupero artisti: ${errorMessage}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero degli artisti',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /supabase/categories
   * Recupera tutte le categorie
   */
  @Get('categories')
  @Version('1')
  @ApiOperation({ summary: 'Recupera tutte le categorie' })
  @ApiQuery({ name: 'includeStats', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista categorie' })
  @Throttle({ default: { limit: 100, ttl: 60 } })
  @CacheTTL(300) // Cache 5 minuti
  async getAllCategories(
    @Query('includeStats') includeStats?: string,
    @Query('page', new DefaultValuePipe(1)) page: number = 1,
    @Query('limit', new DefaultValuePipe(50)) limit: number = 50,
  ): Promise<{
    data: CategoriaResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 📚 Recupero categorie (page: ${page}, limit: ${limit})`,
    );

    try {
      const validatedPage = Math.max(1, Number(page) || 1);
      const validatedLimit = Math.min(100, Math.max(1, Number(limit) || 50));

      // ✅ Estrai array dal PaginatedResult
      const paginatedResult = await this.supabaseService.getAllCategories();
      const categories = paginatedResult?.data ?? [];

      let result: CategoriaResponse[] = categories.map((category) => ({
        id: category.id,
        nome: category.nome,
        counter: category.counter ?? 0,
      }));

      const total = result.length;

      // Paginazione manuale
      const offset = (validatedPage - 1) * validatedLimit;
      result = result.slice(offset, offset + validatedLimit);

      if (includeStats === 'true' && result.length > 0) {
        result = await Promise.all(
          result.map(async (category) => {
            const { count } = await this.supabaseService.supabase
              .from('manga')
              .select('*', { count: 'exact', head: true })
              .eq('categoria_id', category.id);
            return { ...category, mangaCount: count ?? 0 };
          }),
        );
      }

      return {
        data: result,
        total,
        page: validatedPage,
        limit: validatedLimit,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore recupero categorie: ${errorMessage}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore nel recupero delle categorie',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // OPERAZIONI DI SCRITTURA
  // ============================================

  /**
   * PUT /supabase/manga/:id
   * Aggiorna un manga
   */
  @Put('manga/:id')
  @Version('1')
  @ApiOperation({ summary: 'Aggiorna un manga' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Manga aggiornato',
    type: SuccessResponse,
  })
  @ApiResponse({ status: 400, description: 'Dati non validi' })
  @ApiResponse({ status: 404, description: 'Manga non trovato' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: UpdateMangaPayload,
  ): Promise<SuccessResponse> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 🔄 Aggiornamento manga ID: ${id}`,
      updateData,
    );

    if (Object.keys(updateData).length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Nessun dato da aggiornare fornito',
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Verifica che il manga esista
      const existingManga = await this.supabaseService.getMangaById(id);
      if (!existingManga) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${id} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Prepara i dati per l'update
      const updatePayload: MangaUpdate = {};

      if (updateData.titolo !== undefined)
        updatePayload.titolo = updateData.titolo;
      if (updateData.immagine !== undefined)
        updatePayload.immagine = updateData.immagine;
      if (updateData.lingua !== undefined)
        updatePayload.lingua = updateData.lingua;
      if (updateData.visible !== undefined)
        updatePayload.visible = updateData.visible;
      if (updateData.artista_id !== undefined)
        updatePayload.artista_id = updateData.artista_id;
      if (updateData.categoria_id !== undefined)
        updatePayload.categoria_id = updateData.categoria_id;
      if (updateData.numero_pagine !== undefined)
        updatePayload.numero_pagine = updateData.numero_pagine;
      if (updateData.url_origine !== undefined)
        updatePayload.url_origine = updateData.url_origine;
      if (updateData.pagine !== undefined)
        updatePayload.pagine = updateData.pagine;

      const result = await this.supabaseService.updateManga(id, updatePayload);

      if (!result.success) {
        throw result.error;
      }

      // Traccia evento
      await this.supabaseService.trackEvent({
        eventType: EventType.VIEW, // Dovresti usare un tipo appropriato
        mangaId: id,
      });

      this.eventEmitter.emit('manga.updated', {
        mangaId: id,
        changes: Object.keys(updateData),
        requestId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        id,
        message: 'Manga aggiornato con successo',
        requestId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore aggiornamento manga ${id}:`,
        errorMessage,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "Errore durante l'aggiornamento",
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /supabase/manga/:id
   * Elimina un manga (soft delete di default)
   */
  @Delete('manga/:id')
  @Version('1')
  @ApiOperation({ summary: 'Elimina un manga' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Manga eliminato',
    type: DeleteResult,
  })
  @ApiResponse({ status: 404, description: 'Manga non trovato' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('permanent') permanent?: boolean,
  ): Promise<DeleteResult> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 🗑️ ${permanent ? 'Eliminazione permanente' : 'Soft delete'} manga ID: ${id}`,
    );

    try {
      // Verifica che il manga esista
      const existingManga = await this.supabaseService.getMangaById(id);
      if (!existingManga) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${id} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      let result: UpdateResult;

      if (permanent) {
        result = await this.supabaseService.hardDeleteManga(id);
      } else {
        result = await this.supabaseService.softDeleteManga(id);
      }

      if (!result.success) {
        const errorMessage = this.getErrorMessage(result.error);
        throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Traccia evento
      await this.supabaseService.trackEvent({
        eventType: permanent ? 'manga_permanent_delete' : 'manga_soft_delete',
        mangaId: id,
      });

      this.eventEmitter.emit('manga.deleted', {
        mangaId: id,
        permanent,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: permanent
          ? 'Manga eliminato definitivamente'
          : 'Manga nascosto (soft delete)',
        requestId,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore eliminazione manga ${id}:`,
        errorMessage,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "Errore durante l'eliminazione",
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /supabase/manga/:id/restore
   * Ripristina un manga cancellato (soft delete)
   */
  @Put('manga/:id/restore')
  @Version('1')
  @ApiOperation({ summary: 'Ripristina un manga' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Manga ripristinato',
    type: DeleteResult,
  })
  @ApiResponse({ status: 404, description: 'Manga non trovato' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async restore(@Param('id', ParseIntPipe) id: number): Promise<DeleteResult> {
    const requestId = this.generateRequestId();

    this.logger.log(`[${requestId}] 🔄 Ripristino manga ID: ${id}`);

    try {
      // Verifica che il manga esista
      const existingManga = await this.supabaseService.getMangaById(id);
      if (!existingManga) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${id} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const result = await this.supabaseService.restoreManga(id);

      if (!result.success) {
        const errorMessage = this.getErrorMessage(result.error);
        throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Traccia evento
      await this.supabaseService.trackEvent({
        eventType: 'manga_restore',
        mangaId: id,
      });

      this.eventEmitter.emit('manga.restored', {
        mangaId: id,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: 'Manga ripristinato con successo',
        requestId,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore ripristino manga ${id}:`,
        errorMessage,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore durante il ripristino',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // GESTIONE TAG
  // ============================================

  /**
   * POST /supabase/manga/:id/tags/:tagId
   * Aggiunge un tag a un manga
   */
  @Post('manga/:id/tags/:tagId')
  @Version('1')
  @ApiOperation({ summary: 'Aggiunge un tag a un manga' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'tagId', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Tag associato',
    type: SuccessResponse,
  })
  @ApiResponse({ status: 404, description: 'Manga o tag non trovato' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async addTagToManga(
    @Param('id', ParseIntPipe) mangaId: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ): Promise<SuccessResponse> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 🔖 Aggiunta tag ${tagId} al manga ${mangaId}`,
    );

    try {
      // Verifica che il manga esista
      const manga = await this.supabaseService.getMangaById(mangaId);
      if (!manga) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${mangaId} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Verifica che il tag esista
      const tag = await this.supabaseService.getTagById(tagId);
      if (!tag) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Tag con ID ${tagId} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const result = await this.supabaseService.addTagToManga(mangaId, tagId);

      if (!result.success) {
        const errorObj = result.error as ErrorWithCode;
        const isDuplicate = errorObj && errorObj.code === '23505';

        if (isDuplicate) {
          return {
            success: true,
            id: mangaId,
            message: 'Tag già associato al manga',
            requestId,
            timestamp: new Date().toISOString(),
          };
        }

        const errorMessage = this.getErrorMessage(result.error);
        throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.eventEmitter.emit('manga.tag_added', {
        mangaId,
        tagId,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        id: mangaId,
        message: 'Tag associato con successo',
        requestId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(
        `[${requestId}] Errore associazione tag: ${errorMessage}`,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: "Errore durante l'associazione del tag",
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /supabase/manga/:id/tags/:tagId
   * Rimuove un tag da un manga
   */
  @Delete('manga/:id/tags/:tagId')
  @Version('1')
  @ApiOperation({ summary: 'Rimuove un tag da un manga' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'tagId', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Tag rimosso',
    type: SuccessResponse,
  })
  @ApiResponse({ status: 404, description: 'Manga o tag non trovato' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async removeTagFromManga(
    @Param('id', ParseIntPipe) mangaId: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ): Promise<SuccessResponse> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 🔖 Rimozione tag ${tagId} dal manga ${mangaId}`,
    );

    try {
      // Verifica che il manga esista
      const manga = await this.supabaseService.getMangaById(mangaId);
      if (!manga) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Manga con ID ${mangaId} non trovato`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const result = await this.supabaseService.removeTagFromManga(
        mangaId,
        tagId,
      );

      if (!result.success) {
        const errorMessage = this.getErrorMessage(result.error);
        throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.eventEmitter.emit('manga.tag_removed', {
        mangaId,
        tagId,
        requestId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        id: mangaId,
        message: 'Tag rimosso con successo',
        requestId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`[${requestId}] Errore rimozione tag: ${errorMessage}`);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore durante la rimozione del tag',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // ENDPOINT DI RICERCA
  // ============================================

  /**
   * GET /supabase/search
   * Ricerca manga
   */
  @Get('search')
  @Version('1')
  @ApiOperation({ summary: 'Ricerca manga' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Risultati ricerca' })
  @Throttle({ default: { limit: 50, ttl: 60 } })
  @CacheTTL(60) // Cache 1 minuto
  async searchManga(
    @Query('q') query: string,
    @Query('page', new DefaultValuePipe(1)) page: number = 1,
    @Query('limit', new DefaultValuePipe(20)) limit: number = 20,
  ): Promise<MangaListResponse> {
    const requestId = this.generateRequestId();

    this.logger.log(
      `[${requestId}] 🔍 Ricerca manga: "${query}" (page: ${page}, limit: ${limit})`,
    );

    if (!query || query.length < 2) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Il termine di ricerca deve essere di almeno 2 caratteri',
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const validatedPage = Math.max(1, Number(page) || 1);
      const validatedLimit = Math.min(50, Math.max(1, Number(limit) || 20));

      const result = await this.supabaseService.searchManga(
        query,
        validatedPage,
        validatedLimit,
      );

      // ✅ Usa result.total invece di result.count
      return {
        data: result.data as MangaWithRelations[],
        total: result.total,
        page: validatedPage,
        limit: validatedLimit,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrevious: result.hasPrevious,
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`[${requestId}] Errore ricerca: ${errorMessage}`);

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Errore durante la ricerca',
          error: errorMessage,
          requestId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // ENDPOINT DI CATCH-ALL PER ERRORI 404
  // ============================================

  @Get('*')
  @Version('1')
  handleNotFound(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Endpoint non trovato',
        timestamp: new Date().toISOString(),
      },
      HttpStatus.NOT_FOUND,
    );
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Genera ID univoco per request tracing
   */
  private generateRequestId(): string {
    return `sup_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Estrae messaggio di errore
   */
  private getErrorMessage(error: unknown): string {
    if (!error) return 'Errore sconosciuto';

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      if ('message' in errorObj && typeof errorObj.message === 'string') {
        return errorObj.message;
      }
    }

    return 'Errore sconosciuto';
  }

  /**
   * Valida URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
