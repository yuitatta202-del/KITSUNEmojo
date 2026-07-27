import {
  Module,
  Global,
  MiddlewareConsumer,
  NestModule,
  forwardRef,
  Logger,
  type DynamicModule,
} from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BulkController } from './bulk.controller';
import { AdminService } from './admin.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImportModule } from '../import/import.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { AdminAuthGuard } from './guards/admin-auth.guard';

// ============================================
// COSTANTI DI CONFIGURAZIONE
// ============================================

const RATE_LIMIT_TTL = 60;
const RATE_LIMIT_MAX = 100;

// ============================================
// MODULO ADMIN - VERSIONE CORRETTA
// ============================================

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.production'],
    }),

    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      ignoreErrors: false,
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get('RATE_LIMIT_TTL', RATE_LIMIT_TTL),
            limit: config.get('RATE_LIMIT_MAX', RATE_LIMIT_MAX),
          },
        ],
      }),
    }),

    SupabaseModule.register({
      isGlobal: true,
      enableRealtime: false,
      retryAttempts: 3,
      retryDelay: 1000,
    }),

    ImportModule,

    forwardRef(() => AuthModule),
  ],
  controllers: [AdminController, BulkController],
  providers: [
    AdminService,

    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    AdminAuthGuard,

    {
      provide: 'ADMIN_CONFIG',
      useFactory: (configService: ConfigService) => ({
        authorizedAdmins: configService.get('AUTHORIZED_ADMINS', '').split(','),
        requireSignature:
          configService.get('REQUIRE_SIGNATURE', 'true') === 'true',
        maxBulkImport: configService.get('MAX_BULK_IMPORT', 50),
        repairConcurrency: configService.get('REPAIR_CONCURRENCY', 5),
        enableAudit: configService.get('ENABLE_AUDIT', 'true') === 'true',
        enableMetrics: configService.get('ENABLE_METRICS', 'true') === 'true',
      }),
      inject: [ConfigService],
    },
  ],
  exports: [
    AdminService,
    'ADMIN_CONFIG',
    AdminAuthGuard,
    SupabaseModule,
    ImportModule,
    forwardRef(() => AuthModule),
  ],
})
export class AdminModule implements NestModule {
  private readonly logger = new Logger(AdminModule.name);

  constructor(private readonly configService: ConfigService) {
    this.logger.log('🚀 AdminModule initialized');
    this.logger.log(`📊 Features: ${this.getEnabledFeatures().join(', ')}`);
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('admin/*');
  }

  private getEnabledFeatures(): string[] {
    const features: string[] = [];

    if (this.configService.get('ENABLE_METRICS') === 'true') {
      features.push('Metrics');
    }
    if (this.configService.get('ENABLE_AUDIT') === 'true') {
      features.push('Audit');
    }
    if (this.configService.get('REDIS_ENABLED') === 'true') {
      features.push('Redis Cache');
    }
    if (this.configService.get('ENABLE_REALTIME') === 'true') {
      features.push('Realtime');
    }

    return features;
  }

  static forRoot(options: AdminModuleOptions): DynamicModule {
    return {
      module: AdminModule,
      providers: [
        {
          provide: 'ADMIN_OPTIONS',
          useValue: options,
        },
      ],
    };
  }

  static forRootAsync(options: AdminModuleAsyncOptions): DynamicModule {
    return {
      module: AdminModule,
      imports: options.imports || [],
      providers: [
        {
          provide: 'ADMIN_OPTIONS',
          useFactory: options.useFactory as (
            ...args: any[]
          ) => AdminModuleOptions,
          inject: options.inject || [],
        },
      ],
    };
  }
}

// ============================================
// TIPI PER IL MODULO (DA ESPORTARE)
// ============================================

export interface AdminModuleOptions {
  enableMetrics?: boolean;
  enableAudit?: boolean;
  enableCache?: boolean;
  cacheTTL?: number;
  maxBulkImport?: number;
  authorizedAdmins?: string[];
  requireSignature?: boolean;
}

export interface AdminModuleAsyncOptions {
  imports?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<AdminModuleOptions> | AdminModuleOptions;
  inject?: any[];
}
