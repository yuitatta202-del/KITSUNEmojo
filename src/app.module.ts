import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';

// Moduli Core e Funzionali
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReaderModule } from './reader/reader.module';
import { MangaModule } from './manga/manga.module';
import { ImportModule } from './import/import.module';
import { AdminModule } from './admin/admin.module';
import { CommentsModule } from './comments/comments.module';
import { AuthModule } from './auth/auth.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // 1. CONFIGURAZIONE GLOBALE
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // 2. SERVIZI DI SISTEMA (Indispensabili per i tuoi controller)
    // Abilita l'uso di @Inject(CACHE_MANAGER) ovunque
    CacheModule.register({
      isGlobal: true,
      ttl: 600, // 10 minuti default
      max: 100, // Numero massimo di elementi in memoria
    }),

    // Abilita l'uso di EventEmitter2 (this.eventEmitter.emit)
    EventEmitterModule.forRoot({
      wildcard: true, // Permette eventi tipo 'admin.*'
      delimiter: '.',
    }),

    // Protezione Brute Force e Rate Limit globale
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100, // 100 richieste al minuto per IP
      },
    ]),

    // 3. MODULI CORE
    SupabaseModule,

    // 4. MODULI DI AUTENTICAZIONE E UTENTI
    AuthModule,
    UsersModule,

    // 5. MODULI FUNZIONALI & BUSINESS LOGIC
    MangaModule,
    ImportModule,
    CommentsModule,
    ReaderModule,
    RealtimeModule,
    AnalyticsModule,

    // 6. MODULO AMMINISTRATIVO (Caricato per ultimo)
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [SupabaseModule, AuthModule],
})
export class AppModule {}
