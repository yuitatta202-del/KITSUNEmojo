import {
  Module,
  Global,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  type DynamicModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { SupabaseController } from './supabase.controller';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import * as redisStore from 'cache-manager-redis-store';
import { createClient } from '@supabase/supabase-js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// ============================================
// INTERFACCE E TIPI
// ============================================

export interface SupabaseModuleOptions {
  isGlobal?: boolean;
  enableRealtime?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  cacheTTL?: number;
  enableMetrics?: boolean;
  connectionTimeout?: number;
  maxConnections?: number;
  healthCheck?: boolean;
  serviceName?: string;
}

export interface SupabaseModuleAsyncOptions {
  imports?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<SupabaseModuleOptions> | SupabaseModuleOptions;
  inject?: any[];
  isGlobal?: boolean;
}

// ============================================
// COSTANTI
// ============================================

const DEFAULT_OPTIONS: SupabaseModuleOptions = {
  isGlobal: true,
  enableRealtime: false,
  retryAttempts: 5,
  retryDelay: 1000,
  cacheTTL: 300,
  enableMetrics: true,
  connectionTimeout: 10000,
  maxConnections: 20,
  healthCheck: true,
  serviceName: 'supabase',
};

const SUPABASE_MODULE_OPTIONS = 'SUPABASE_MODULE_OPTIONS';
const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

// ============================================
// MODULO PRINCIPALE
// ============================================

@Global()
@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: (configService: ConfigService) => ({
        store:
          configService.get('REDIS_ENABLED') === 'true' ? redisStore : 'memory',
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', 6379),
        ttl: configService.get('CACHE_TTL', DEFAULT_OPTIONS.cacheTTL),
        max: 1000,
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      ignoreErrors: false,
      verboseMemoryLeak: true,
    }),
  ],
  controllers: [SupabaseController],
  providers: [
    {
      provide: SUPABASE_MODULE_OPTIONS,
      useValue: DEFAULT_OPTIONS,
    },
    {
      provide: SUPABASE_CLIENT,
      useFactory: async (configService: ConfigService) => {
        return await createSupabaseClient(configService, DEFAULT_OPTIONS);
      },
      inject: [ConfigService],
    },
    {
      provide: SupabaseService,
      useFactory: (
        configService: ConfigService,
        eventEmitter: EventEmitter2,
        cacheManager: Cache,
      ) => {
        return new SupabaseService(configService, eventEmitter, cacheManager);
      },
      inject: [ConfigService, EventEmitter2, 'CACHE_MANAGER'],
    },
  ],
  exports: [SupabaseService, SUPABASE_CLIENT, SUPABASE_MODULE_OPTIONS],
})
export class SupabaseModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupabaseModule.name);
  private connections: Map<string, any> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.logger.log('🚀 SupabaseModule initialized');
    this.logger.log(`📊 Features: ${this.getEnabledFeatures().join(', ')}`);
  }

  async onModuleInit() {
    this.logger.log('🔄 Initializing Supabase connections...');
    try {
      await this.verifyConnections();
      this.logger.log('✅ Supabase connections verified');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`❌ Failed to initialize Supabase: ${err.message}`);
      this.retryConnection();
    }
  }

  async onModuleDestroy() {
    this.logger.log('🧹 Cleaning up Supabase connections...');
    for (const [name, client] of this.connections) {
      try {
        if (client?.dispose) await client.dispose();
        this.logger.debug(`✅ Closed connection: ${name}`);
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `❌ Error closing connection ${name}: ${err.message}`,
        );
      }
    }
    this.connections.clear();
    this.logger.log('✅ SupabaseModule cleanup completed');
  }

  private async verifyConnections() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Supabase credentials not configured');
    const client = createClient(url, key);
    const { error } = await client.from('manga').select('id').limit(1);
    if (error) throw new Error(`Connection test failed: ${error.message}`);
    this.connections.set('default', client);
  }

  private retryConnection() {
    const maxRetries = this.configService.get('SUPABASE_RETRY_ATTEMPTS', 5);
    const retryDelay = this.configService.get('SUPABASE_RETRY_DELAY', 1000);
    let attempts = 0;
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const interval = setInterval(async () => {
      attempts++;
      try {
        await this.verifyConnections();
        clearInterval(interval);
        this.logger.log('✅ Supabase reconnection successful');
      } catch (error) {
        const err = error as Error;
        if (attempts >= maxRetries) {
          clearInterval(interval);
          this.logger.error(
            `❌ Failed after ${maxRetries} attempts: ${err.message}`,
          );
        }
      }
    }, retryDelay);
  }

  private getEnabledFeatures(): string[] {
    const features: string[] = [];
    if (this.configService.get('SUPABASE_REALTIME_ENABLED') === 'true')
      features.push('Realtime');
    if (this.configService.get('ENABLE_METRICS', 'true') === 'true')
      features.push('Metrics');
    if (this.configService.get('HEALTH_CHECK', 'true') === 'true')
      features.push('HealthCheck');
    if (this.configService.get('REDIS_ENABLED') === 'true')
      features.push('RedisCache');
    return features;
  }

  static register(options: SupabaseModuleOptions): DynamicModule {
    return {
      module: SupabaseModule,
      global: options.isGlobal ?? true,
      providers: [
        {
          provide: SUPABASE_MODULE_OPTIONS,
          useValue: { ...DEFAULT_OPTIONS, ...options },
        },
      ],
      exports: [SupabaseService, SUPABASE_CLIENT],
    };
  }

  static registerAsync(options: SupabaseModuleAsyncOptions): DynamicModule {
    return {
      module: SupabaseModule,
      global: options.isGlobal ?? true,
      imports: options.imports || [],
      providers: [
        {
          provide: SUPABASE_MODULE_OPTIONS,
          useFactory: options.useFactory as (
            ...args: any[]
          ) => SupabaseModuleOptions,
          inject: options.inject || [],
        },
      ],
      exports: [SupabaseService, SUPABASE_CLIENT],
    };
  }
}

// ============================================
// FUNZIONI DI UTILITY
// ============================================

async function createSupabaseClient(
  configService: ConfigService,
  options: SupabaseModuleOptions,
): Promise<any> {
  const log = new Logger('SupabaseClient');
  const supabaseUrl = configService.get<string>('SUPABASE_URL');
  const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  log.log(`🔌 Connecting to Supabase at ${supabaseUrl}`);

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { schema: 'public' },
    global: {
      headers: {
        'x-application-name': options.serviceName || 'kitsune-mojo',
        'x-client-version': process.env.npm_package_version || '1.0.0',
      },
    },
  });

  const { error } = await client.from('manga').select('id').limit(1);
  if (error) throw new Error(`Connection test failed: ${error.message}`);

  log.log('✅ Connected successfully');
  return client;
}

export * from './supabase.service';
export * from './supabase.controller';
