// src/app.module.ts ✅ CORRETTO
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminController } from './admin/admin.controller';
import { MangaController } from './manga/manga.controller';
import { BulkController } from './admin/bulk.controller';
import { ReaderModule } from './reader/reader.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    RealtimeModule,
    ReaderModule, // ✅ CORRETTO: modulo in imports
  ],
  controllers: [
    AppController,
    AdminController,
    MangaController,
    BulkController, // ✅ CORRETTO: solo controller qui
  ],
  providers: [AppService],
})
export class AppModule {}
